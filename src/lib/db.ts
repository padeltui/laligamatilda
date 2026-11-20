import type { CategoryEntry } from '../domain/categories';
import type { Group, GroupId, PlayerId, ScheduledMatch, SetScore } from '../domain/types';
import { supabase } from './supabase';

export type RoundState = 'borrador' | 'en_curso' | 'cerrada';
export type MatchState = 'pendiente' | 'jugado' | 'aplazado';

export interface Player {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface Season {
  id: string;
  numero: number;
  estado: 'en_curso' | 'cerrada';
  fecha_inicio: string;
}

export interface Round {
  id: string;
  numero: number;
  estado: RoundState;
  fecha_inicio: string | null;
  temporada_id: string;
}

export interface RoundMatch extends ScheduledMatch {
  id: string;
  estado: MatchState;
  /** Franja de la liga suiza (sab_manana…); null en los partidos de vuelta. */
  slot: string | null;
  sets: SetScore[];
  /** Última modificación (al guardar un resultado se actualiza). */
  updatedAt: string;
}

export interface RoundData {
  round: Round;
  groups: Group[];
  matches: RoundMatch[];
  /** Orden final de cada grupo guardado al cerrar la vuelta; null si aún no está cerrada. */
  finalRanking: Map<GroupId, PlayerId[]> | null;
}

interface GroupRow {
  vuelta_id: string;
  jugador_id: string;
  grupo: string;
  posicion_final: number | null;
}

interface MatchRow {
  id: string;
  vuelta_id: string | null;
  semana_id: string | null;
  franja: string | null;
  semana: number;
  tipo: string;
  pareja1_j1: string;
  pareja1_j2: string;
  pareja2_j1: string;
  pareja2_j2: string;
  estado: MatchState;
  actualizado_en: string;
  sets: { numero: number; juegos_pareja1: number; juegos_pareja2: number }[];
}

type Result<T> = { data: T | null; error: { message: string } | null };

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}

function unwrap<T>(result: Result<T>): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function fetchPlayers(): Promise<Player[]> {
  return unwrap<Player[]>(await client().from('jugadores').select('id, nombre, activo').order('nombre'));
}

export async function createPlayer(nombre: string): Promise<void> {
  unwrap(await client().from('jugadores').insert({ nombre: nombre.trim() }));
}

export async function updatePlayer(id: string, patch: Partial<Pick<Player, 'nombre' | 'activo'>>): Promise<void> {
  unwrap(await client().from('jugadores').update(patch).eq('id', id));
}

export async function fetchSeasons(): Promise<Season[]> {
  return unwrap<Season[]>(await client().from('temporadas').select('id, numero, estado, fecha_inicio').order('numero', { ascending: false }));
}

export async function fetchRounds(): Promise<Round[]> {
  return unwrap<Round[]>(
    await client().from('vueltas').select('id, numero, estado, fecha_inicio, temporada_id').order('numero', { ascending: false }),
  );
}

const MATCH_COLUMNS =
  'id, vuelta_id, semana_id, franja, semana, tipo, pareja1_j1, pareja1_j2, pareja2_j1, pareja2_j2, estado, actualizado_en, sets(numero, juegos_pareja1, juegos_pareja2)';

function toMatch(row: MatchRow): RoundMatch {
  return {
    id: row.id,
    week: row.semana,
    kind: row.tipo,
    pair1: [row.pareja1_j1, row.pareja1_j2] as const,
    pair2: [row.pareja2_j1, row.pareja2_j2] as const,
    estado: row.estado,
    slot: row.franja,
    updatedAt: row.actualizado_en,
    sets: [...row.sets]
      .sort((a, b) => a.numero - b.numero)
      .map((set) => ({ pair1: set.juegos_pareja1, pair2: set.juegos_pareja2 })),
  };
}

/** Grupos, partidos y resultados de todas las vueltas, en el mismo orden que `rounds`. */
export async function fetchHistory(rounds: readonly Round[]): Promise<RoundData[]> {
  if (rounds.length === 0) return [];
  const [groupResult, matchResult] = await Promise.all([
    client().from('vuelta_grupos').select('vuelta_id, jugador_id, grupo, posicion_final'),
    client()
      .from('partidos')
      .select(
        MATCH_COLUMNS,
      )
      .order('semana'),
  ]);
  const groupRows = unwrap<GroupRow[]>(groupResult);
  const matchRows = unwrap<MatchRow[]>(matchResult);
  return rounds.map((round) =>
    toRoundData(
      round,
      groupRows.filter((row) => row.vuelta_id === round.id),
      matchRows.filter((row) => row.vuelta_id === round.id),
    ),
  );
}

function toRoundData(round: Round, groupRows: GroupRow[], matchRows: MatchRow[]): RoundData {
  const groupIds = [...new Set(groupRows.map((row) => row.grupo))].sort();
  const groups = groupIds.map((id) => ({
    id,
    players: groupRows.filter((row) => row.grupo === id).map((row) => row.jugador_id),
  }));
  const finalRanking = groupRows.length > 0 && groupRows.every((row) => row.posicion_final !== null)
    ? new Map(
        groupIds.map((id) => [
          id,
          groupRows
            .filter((row) => row.grupo === id)
            .sort((a, b) => a.posicion_final! - b.posicion_final!)
            .map((row) => row.jugador_id),
        ]),
      )
    : null;
  return { round, groups, matches: matchRows.map(toMatch), finalRanking };
}

export async function createRound(numero: number, groups: readonly Group[], matches: readonly ScheduledMatch[]): Promise<string> {
  const grupos = groups.flatMap((group) => group.players.map((jugador_id) => ({ jugador_id, grupo: group.id })));
  const partidos = matches.map((match) => ({
    semana: match.week,
    tipo: match.kind,
    pareja1_j1: match.pair1[0],
    pareja1_j2: match.pair1[1],
    pareja2_j1: match.pair2[0],
    pareja2_j2: match.pair2[1],
  }));
  return unwrap<string>(await client().rpc('crear_vuelta', { p_numero: numero, p_grupos: grupos, p_partidos: partidos }));
}

/** Cierra la vuelta guardando el orden final de cada grupo (ya con los sorteos resueltos). */
export async function closeRound(roundId: string, ranking: ReadonlyMap<GroupId, readonly PlayerId[]>): Promise<void> {
  const p_posiciones = [...ranking.values()].flatMap((players) => players.map((jugador_id, i) => ({ jugador_id, posicion: i + 1 })));
  unwrap(await client().rpc('cerrar_vuelta', { p_vuelta: roundId, p_posiciones }));
}

/** Borra una vuelta con sus grupos y partidos (solo se ofrece si no tiene resultados). */
export async function deleteRound(roundId: string): Promise<void> {
  unwrap(await client().from('vueltas').delete().eq('id', roundId));
}

/** Cierra la temporada en curso y abre la siguiente. */
export async function startSeason(): Promise<void> {
  unwrap(await client().rpc('nueva_temporada'));
}

/** Guarda los sets de un partido; con una lista vacía borra el resultado. */
export async function saveResult(matchId: string, sets: readonly SetScore[]): Promise<void> {
  const p_sets = sets.map((set) => ({ pareja1: set.pair1, pareja2: set.pair2 }));
  unwrap(await client().rpc('guardar_resultado', { p_partido: matchId, p_sets }));
}

export async function updateMatch(match: Pick<RoundMatch, 'id' | 'week' | 'pair1' | 'pair2' | 'estado'>): Promise<void> {
  unwrap(
    await client()
      .from('partidos')
      .update({
        semana: match.week,
        pareja1_j1: match.pair1[0],
        pareja1_j2: match.pair1[1],
        pareja2_j1: match.pair2[0],
        pareja2_j2: match.pair2[1],
        estado: match.estado,
      })
      .eq('id', match.id),
  );
}

// ---------- Liga suiza ----------

export interface Week {
  id: string;
  numero: number;
  /** Lunes de la semana (AAAA-MM-DD). */
  fecha_inicio: string;
  estado: 'abierta' | 'publicada';
}

export interface WeekData {
  week: Week;
  /** Franjas de cada apuntado. */
  availability: Map<PlayerId, string[]>;
  /** Categoría de cada jugador esa semana (foto tomada al abrirla). */
  categories: Map<PlayerId, CategoryEntry>;
  matches: RoundMatch[];
}

/** Todas las semanas con su disponibilidad y sus partidos, de la más reciente a la más antigua. */
export async function fetchWeeks(): Promise<WeekData[]> {
  const [weekResult, availabilityResult, matchResult, categoryResult] = await Promise.all([
    client().from('semanas').select('id, numero, fecha_inicio, estado').order('numero', { ascending: false }),
    client().from('disponibilidad').select('semana_id, jugador_id, franja'),
    client().from('partidos').select(MATCH_COLUMNS).not('semana_id', 'is', null),
    client().from('semana_categorias').select('semana_id, jugador_id, categoria, posicion'),
  ]);
  const categories = unwrap<{ semana_id: string; jugador_id: string; categoria: string; posicion: number }[]>(categoryResult);
  const weeks = unwrap<Week[]>(weekResult);
  const availability = unwrap<{ semana_id: string; jugador_id: string; franja: string }[]>(availabilityResult);
  const matches = unwrap<MatchRow[]>(matchResult);
  return weeks.map((week) => {
    const byPlayer = new Map<PlayerId, string[]>();
    for (const row of availability.filter((r) => r.semana_id === week.id)) {
      byPlayer.set(row.jugador_id, [...(byPlayer.get(row.jugador_id) ?? []), row.franja]);
    }
    return {
      week,
      availability: byPlayer,
      categories: new Map(
        categories
          .filter((c) => c.semana_id === week.id)
          .map((c) => [c.jugador_id, { category: c.categoria, position: c.posicion }]),
      ),
      matches: matches.filter((m) => m.semana_id === week.id).map(toMatch),
    };
  });
}

/** Abre la inscripción de una semana guardando la foto de categorías de ese momento. */
export async function openWeek(fechaInicio: string, categories: ReadonlyMap<PlayerId, CategoryEntry>): Promise<void> {
  const p_categorias = [...categories].map(([jugador_id, c]) => ({ jugador_id, categoria: c.category, posicion: c.position }));
  unwrap(await client().rpc('abrir_semana', { p_fecha_inicio: fechaInicio, p_categorias }));
}

/** Guarda las franjas de un jugador en la semana abierta; con una lista vacía lo desapunta. */
export async function signUp(weekId: string, playerId: string, slots: readonly string[], pin: string): Promise<void> {
  unwrap(await client().rpc('apuntarse', { p_semana: weekId, p_jugador: playerId, p_franjas: slots, p_pin: pin }));
}

export async function publishWeek(weekId: string, matches: readonly { slot: string; pair1: readonly string[]; pair2: readonly string[] }[]): Promise<void> {
  const p_partidos = matches.map((m) => ({
    franja: m.slot,
    pareja1_j1: m.pair1[0],
    pareja1_j2: m.pair1[1],
    pareja2_j1: m.pair2[0],
    pareja2_j2: m.pair2[1],
  }));
  unwrap(await client().rpc('publicar_semana', { p_semana: weekId, p_partidos }));
}

export async function unpublishWeek(weekId: string): Promise<void> {
  unwrap(await client().rpc('despublicar_semana', { p_semana: weekId }));
}

export async function hasPin(): Promise<boolean> {
  return unwrap<boolean>(await client().rpc('hay_pin'));
}

export async function changePin(pin: string): Promise<void> {
  unwrap(await client().rpc('cambiar_pin', { p_pin: pin }));
}

/** Cambia franja, jugadores o estado de un partido de la liga suiza. */
export async function updateWeekMatch(match: Pick<RoundMatch, 'id' | 'pair1' | 'pair2' | 'estado'> & { slot: string }): Promise<void> {
  unwrap(
    await client()
      .from('partidos')
      .update({
        franja: match.slot,
        pareja1_j1: match.pair1[0],
        pareja1_j2: match.pair1[1],
        pareja2_j1: match.pair2[0],
        pareja2_j2: match.pair2[1],
        estado: match.estado,
      })
      .eq('id', match.id),
  );
}
