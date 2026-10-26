import { shuffle, type Rng } from './rng';
import type { Group, Pair, PlayerId, ScheduledMatch } from './types';

/** Tamaños de grupo admitidos. */
export const GROUP_SIZES = [4, 5];
/** Partidos obligatorios por jugador; en la clasificación de la vuelta cuentan sus mejores 3. */
export const MATCHES_PER_PLAYER = 3;
/** Semanas con partido: 1, 2 y 3. */
export const PLAY_WEEKS = 3;
/** Semana extra al final de la vuelta para recuperar partidos aplazados. */
export const RECOVERY_WEEK = PLAY_WEEKS + 1;

/** Devuelve un mensaje si los grupos no sirven para generar una vuelta, o null si están bien. */
export function checkGroups(groups: readonly Group[]): string | null {
  if (groups.length === 0) return 'Hace falta al menos un grupo.';
  const wrong = groups.find((group) => !GROUP_SIZES.includes(group.players.length));
  if (wrong) return `El grupo ${wrong.id} tiene ${wrong.players.length} jugadores; cada grupo debe tener 4 o 5.`;
  const allPlayers = groups.flatMap((group) => group.players);
  if (new Set(allPlayers).size !== allPlayers.length) return 'Hay jugadores repetidos entre grupos.';
  return null;
}

/**
 * Genera los partidos de una vuelta, uno por grupo y semana, sin repetir pareja:
 * - Grupo de 4: los 3 partidos posibles, en las semanas 1, 2 y 3 (la 4 queda para recuperar).
 * - Grupo de 5: 4 partidos, en las semanas 1 a 4; en cada uno descansa un jugador distinto,
 *   así que cuatro juegan 3 partidos y uno juega 4.
 */
export function generateRound(groups: readonly Group[], options: { rng?: Rng } = {}): ScheduledMatch[] {
  const error = checkGroups(groups);
  if (error) throw new Error(error);
  const rng = options.rng ?? Math.random;

  return groups
    .flatMap((group) => {
      const players = shuffle(group.players, rng);
      const pairings = players.length === 5 ? shuffle(rotationOfFive(players), rng).slice(0, 4) : shuffle(pairingsOf(players), rng);
      return pairings.map(([pair1, pair2], i) => ({ week: i + 1, kind: group.id, pair1, pair2 }));
    })
    .sort((a, b) => a.week - b.week || a.kind.localeCompare(b.kind));
}

/**
 * Rotación completa de 5 jugadores: 5 partidos, en el k-ésimo descansa el jugador k
 * y cada pareja posible aparece exactamente una vez.
 */
function rotationOfFive(p: readonly PlayerId[]): [Pair, Pair][] {
  return [0, 1, 2, 3, 4].map((k) => [
    [p[(k + 1) % 5], p[(k + 4) % 5]],
    [p[(k + 2) % 5], p[(k + 3) % 5]],
  ]);
}

/** Las 3 formas de repartir 4 jugadores en dos parejas. */
function pairingsOf([a, b, c, d]: readonly PlayerId[]): [Pair, Pair][] {
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

export function pairKey([a, b]: Pair): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
