import { nextGroups } from '../domain/promotion';
import { MATCHES_PER_PLAYER } from '../domain/schedule';
import { validateSets } from '../domain/scoring';
import { groupStandings, type PlayedMatch, type StandingRow } from '../domain/standings';
import type { SeasonRound } from '../domain/season';
import type { Group, GroupId, HistoryMatch, PlayerId } from '../domain/types';
import { categoryRanking, type CategoryEntry } from '../domain/categories';
import { slotLabel } from '../domain/swiss';
import type { RoundData, RoundMatch, WeekData } from './db';

export const GROUP_IDS: GroupId[] = ['A', 'B', 'C'];

/** Jugadores que suben y bajan entre cada par de grupos al cerrar una vuelta. */
export const PROMOTIONS = 2;

/** Partidos con resultado válido, que son los que cuentan para la clasificación. */
export function playedMatches(matches: readonly RoundMatch[]): PlayedMatch[] {
  return matches.filter((match) => match.estado === 'jugado' && validateSets(match.sets) === null);
}

export function roundStandings(data: Pick<RoundData, 'groups' | 'matches'>): Map<GroupId, StandingRow[]> {
  const played = playedMatches(data.matches);
  return new Map(data.groups.map((group) => [group.id, groupStandings(group.players, played, MATCHES_PER_PLAYER)]));
}

type RankingSource = Pick<RoundData, 'groups' | 'matches'> & { finalRanking?: RoundData['finalRanking'] };

/** Orden de cada grupo: el guardado al cerrar la vuelta o, si no lo hay, el de la clasificación actual. */
export function groupOrder(data: RankingSource): Map<GroupId, PlayerId[]> {
  if (data.finalRanking) return data.finalRanking;
  return new Map([...roundStandings(data)].map(([id, rows]) => [id, rows.map((row) => row.player)]));
}

/** Grupos que no han jugado ningún partido en la vuelta («no disputados»). */
export function unplayedGroups(data: Pick<RoundData, 'groups' | 'matches'>): Set<GroupId> {
  return new Set(data.groups.filter((g) => !data.matches.some((m) => m.kind === g.id && m.estado === 'jugado')).map((g) => g.id));
}

/** ¿Hay subidas y bajadas entre estos dos grupos? No, si alguno no se ha disputado. */
export function boundaryOpen(unplayed: ReadonlySet<GroupId>, upper: GroupId, lower: GroupId): boolean {
  return !unplayed.has(upper) && !unplayed.has(lower);
}

/** Grupos de la siguiente vuelta aplicando los ascensos y descensos (sin tocar los grupos no disputados). */
export function proposeNextGroups(data: RankingSource, order: ReadonlyMap<GroupId, readonly PlayerId[]> = groupOrder(data)): Group[] {
  return nextGroups(data.groups, order, PROMOTIONS, unplayedGroups(data));
}

/**
 * Los partidos de la liga suiza se ordenan después de los de las vueltas: la semana n
 * cuenta como la «vuelta» SWISS_ROUND_OFFSET + n a efectos de orden cronológico.
 */
export const SWISS_ROUND_OFFSET = 1000;

/** Todos los partidos con resultado (vueltas y semanas), para Elo, estadísticas e histórico. */
export function historyMatches(history: readonly RoundData[], weeks: readonly WeekData[] = []): HistoryMatch[] {
  const fromRounds = history.flatMap((data) =>
    playedMatches(data.matches).map((match) => {
      const m = match as RoundMatch;
      return {
        id: m.id, round: data.round.numero, week: m.week, playedAt: m.updatedAt, pair1: m.pair1, pair2: m.pair2, sets: m.sets,
        label: `Vuelta ${data.round.numero} · S${m.week}`,
      };
    }),
  );
  const fromWeeks = weeks.flatMap((data) =>
    playedMatches(data.matches).map((match) => {
      const m = match as RoundMatch;
      return {
        id: m.id, round: SWISS_ROUND_OFFSET + data.week.numero, week: 1, playedAt: m.updatedAt, pair1: m.pair1, pair2: m.pair2, sets: m.sets,
        label: `Semana ${data.week.numero}${m.slot ? ` · ${slotLabel(m.slot)}` : ''}`,
      };
    }),
  );
  return [...fromRounds, ...fromWeeks];
}

/** La semana con inscripción abierta o, si no hay, la más reciente. */
export function currentWeek(weeks: readonly WeekData[]): WeekData | null {
  return weeks.find((w) => w.week.estado === 'abierta') ?? weeks[0] ?? null;
}

/** Fecha concreta de una franja: sábado o domingo de la semana que empieza el lunes `fechaInicio`. */
export function slotDate(fechaInicio: string, slot: string): Date {
  const date = new Date(`${fechaInicio}T12:00:00`);
  date.setDate(date.getDate() + (slot.startsWith('sab') ? 5 : 6));
  return date;
}

export function formatSlot(fechaInicio: string, slot: string): string {
  const day = slotDate(fechaInicio, slot).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${slot.endsWith('manana') ? 'mañana' : 'tarde'}`;
}

/** Vueltas cerradas con su orden final (de todas las temporadas, o de una si se indica). */
export function closedRounds(history: readonly RoundData[], seasonId?: string): SeasonRound[] {
  return history
    .filter((data) => data.round.estado === 'cerrada' && (seasonId === undefined || data.round.temporada_id === seasonId))
    .map((data) => ({ round: data.round.numero, ranking: groupOrder(data), unplayed: unplayedGroups(data) }));
}

/** Vueltas cerradas de una temporada, para el ranking de temporada. */
export function seasonRounds(history: readonly RoundData[], seasonId: string): SeasonRound[] {
  return closedRounds(history, seasonId);
}

export interface TrajectoryStep {
  round: number;
  group: GroupId;
  position: number;
  /** false si la vuelta sigue en curso (posición provisional). */
  final: boolean;
}

/** Grupo y posición de un jugador en cada vuelta, de la primera a la última. */
export function trajectory(player: PlayerId, history: readonly RoundData[]): TrajectoryStep[] {
  return [...history]
    .sort((a, b) => a.round.numero - b.round.numero)
    .flatMap((data) => {
      for (const [group, players] of groupOrder(data)) {
        const i = players.indexOf(player);
        if (i >= 0) return [{ round: data.round.numero, group, position: i + 1, final: data.round.estado === 'cerrada' }];
      }
      return [];
    });
}

export function formatSets(match: Pick<RoundMatch, 'sets'>): string {
  return match.sets.map((set) => `${set.pair1}-${set.pair2}`).join('  ');
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface Category {
  name: string;
  medal: string;
  /** Sufijo de las clases CSS: gold, silver, bronze. */
  tone: string;
}

const CATEGORIES: Record<string, Category> = {
  A: { name: 'Oro', medal: '🥇', tone: 'gold' },
  B: { name: 'Plata', medal: '🥈', tone: 'silver' },
  C: { name: 'Bronce', medal: '🥉', tone: 'bronze' },
};

export function categoryOf(groupId: string): Category {
  return CATEGORIES[groupId] ?? { name: groupId, medal: '🎾', tone: 'neutral' };
}

/** Texto corto del tipo de partido: la categoría de su grupo. */
export function kindLabel(kind: string): string {
  return categoryOf(kind).name;
}

export interface RoundProgress {
  weeks: { week: number; complete: boolean }[];
  /** Primera semana con partidos sin jugar; null si la vuelta está completa. */
  currentWeek: number | null;
  played: number;
  total: number;
}

export function roundProgress(matches: readonly RoundMatch[]): RoundProgress {
  const weekNumbers = [...new Set(matches.map((m) => m.week))].sort((a, b) => a - b);
  const weeks = weekNumbers.map((week) => ({
    week,
    complete: matches.filter((m) => m.week === week).every((m) => m.estado === 'jugado'),
  }));
  return {
    weeks,
    currentWeek: weeks.find((w) => !w.complete)?.week ?? null,
    played: matches.filter((m) => m.estado === 'jugado').length,
    total: matches.length,
  };
}

export function groupMatches(groupId: string, matches: readonly RoundMatch[]): RoundMatch[] {
  return matches.filter((m) => m.kind === groupId);
}

/** Últimos partidos con resultado, del más reciente al más antiguo. */
export function latestResults(matches: readonly RoundMatch[], limit: number): RoundMatch[] {
  return matches
    .filter((m) => m.estado === 'jugado' && validateSets(m.sets) === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** Categorías de la semana actual y de la anterior (para los ascensos y descensos). */
export function weekCategories(weeks: readonly WeekData[]): { current: Map<PlayerId, CategoryEntry>; previous: Map<PlayerId, CategoryEntry> } {
  const withCategories = weeks.filter((w) => w.categories.size > 0);
  return { current: withCategories[0]?.categories ?? new Map(), previous: withCategories[1]?.categories ?? new Map() };
}

/** Semanas con su foto de categorías, en el formato del medallero. */
export function weeklyMedalRounds(weeks: readonly WeekData[]): SeasonRound[] {
  return weeks
    .filter((w) => w.categories.size > 0)
    .map((w) => ({ round: SWISS_ROUND_OFFSET + w.week.numero, ranking: categoryRanking(w.categories) }));
}
