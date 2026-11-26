import { chronological } from './history';
import { scoreMatch } from './scoring';
import type { HistoryMatch, Pair, PlayerId } from './types';

/** Todos empiezan con el mismo índice. */
export const ELO_START = 1000;
/** Puntos en juego en un partido (antes de aplicar el factor de juegos). */
export const ELO_K = 32;
/** Factor por diferencia de juegos: base + por juego, con un tope de juegos. */
export const MARGIN_BASE = 0.7;
export const MARGIN_PER_GAME = 0.05;
export const MARGIN_CAP = 12;

/**
 * Cuánto pesa el resultado: 0,75 si se gana por un juego (6-4 5-7 7-6), 1 con 6 juegos
 * de diferencia (6-3 6-3) y 1,3 como máximo (6-0 6-0).
 */
export function marginFactor(sets: readonly { pair1: number; pair2: number }[]): number {
  const diff = Math.abs(sets.reduce((sum, s) => sum + s.pair1 - s.pair2, 0));
  return MARGIN_BASE + MARGIN_PER_GAME * Math.min(diff, MARGIN_CAP);
}

export interface EloChange {
  matchId: string;
  before: number;
  after: number;
  delta: number;
}

export interface EloResult {
  ratings: Map<PlayerId, number>;
  /** Cambios de cada jugador, en orden cronológico. */
  changes: Map<PlayerId, EloChange[]>;
}

/** Probabilidad de que gane la pareja con media `team` contra la de media `opponent`. */
export function expectedScore(team: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - team) / 400));
}

/**
 * Índice Matilda: Elo por parejas. La fuerza de cada pareja es la media de sus dos
 * jugadores; ganar con un compañero fuerte o contra rivales flojos suma menos.
 * Los dos jugadores de una pareja ganan o pierden lo mismo, y cuanto mayor es la
 * diferencia de juegos, más se mueve el índice.
 */
export function computeElo(matches: readonly HistoryMatch[]): EloResult {
  const ratings = new Map<PlayerId, number>();
  const changes = new Map<PlayerId, EloChange[]>();
  const rating = (player: PlayerId) => ratings.get(player) ?? ELO_START;
  const average = (pair: Pair) => (rating(pair[0]) + rating(pair[1])) / 2;

  for (const match of chronological(matches)) {
    const outcome = scoreMatch(match.sets);
    const expected1 = expectedScore(average(match.pair1), average(match.pair2));
    const delta1 = ELO_K * marginFactor(match.sets) * ((outcome.winner === 1 ? 1 : 0) - expected1);

    for (const [pair, delta] of [[match.pair1, delta1], [match.pair2, -delta1]] as const) {
      for (const player of pair) {
        const before = rating(player);
        const after = before + delta;
        ratings.set(player, after);
        const list = changes.get(player) ?? [];
        list.push({ matchId: match.id, before, after, delta });
        changes.set(player, list);
      }
    }
  }
  return { ratings, changes };
}
