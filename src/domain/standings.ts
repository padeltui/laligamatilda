import { scoreMatch } from './scoring';
import type { Pair, PlayerId, SetScore } from './types';

export interface PlayedMatch {
  pair1: Pair;
  pair2: Pair;
  sets: readonly SetScore[];
}

export interface StandingRow {
  player: PlayerId;
  /** Partidos jugados (todos, también los descartados). */
  played: number;
  /** Partidos que no cuentan por superar el máximo (se descartan los peores). */
  discarded: number;
  won: number;
  lost: number;
  /** Igual a victorias: cada partido ganado vale 1 punto. */
  points: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  position: number;
  /** Empatado en todos los criterios con el anterior: se decide por sorteo. */
  tiedWithPrevious: boolean;
}

interface Contribution {
  won: boolean;
  points: number;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
}

/** De mejor a peor: victoria, diferencia de sets, diferencia de juegos. */
function byBest(a: Contribution, b: Contribution): number {
  return Number(b.won) - Number(a.won) || b.setsFor - b.setsAgainst - (a.setsFor - a.setsAgainst) || b.gamesFor - b.gamesAgainst - (a.gamesFor - a.gamesAgainst);
}

/**
 * Clasificación individual de un grupo. Para cada jugador cuentan como mucho sus
 * `maxCounted` mejores partidos; los jugadores de otros grupos (p. ej. suplentes) se ignoran.
 * Orden: victorias, diferencia de sets, diferencia de juegos, juegos ganados.
 */
export function groupStandings(players: readonly PlayerId[], matches: readonly PlayedMatch[], maxCounted = Infinity): StandingRow[] {
  const contributions = new Map<PlayerId, Contribution[]>(players.map((player) => [player, []]));

  for (const match of matches) {
    const outcome = scoreMatch(match.sets);
    const sides = [
      { pair: match.pair1, won: outcome.winner === 1, points: outcome.pointsPair1, setsFor: outcome.setsPair1, setsAgainst: outcome.setsPair2, gamesFor: outcome.gamesPair1, gamesAgainst: outcome.gamesPair2 },
      { pair: match.pair2, won: outcome.winner === 2, points: outcome.pointsPair2, setsFor: outcome.setsPair2, setsAgainst: outcome.setsPair1, gamesFor: outcome.gamesPair2, gamesAgainst: outcome.gamesPair1 },
    ];
    for (const { pair, ...contribution } of sides) {
      for (const player of pair) contributions.get(player)?.push(contribution);
    }
  }

  const rows = [...contributions].map(([player, all]): StandingRow => {
    const counted = [...all].sort(byBest).slice(0, maxCounted);
    const sum = (f: (c: Contribution) => number) => counted.reduce((s, c) => s + f(c), 0);
    const won = counted.filter((c) => c.won).length;
    const setsWon = sum((c) => c.setsFor);
    const setsLost = sum((c) => c.setsAgainst);
    const gamesWon = sum((c) => c.gamesFor);
    const gamesLost = sum((c) => c.gamesAgainst);
    return {
      player,
      played: all.length,
      discarded: all.length - counted.length,
      won,
      lost: counted.length - won,
      points: sum((c) => c.points),
      setsWon,
      setsLost,
      setDiff: setsWon - setsLost,
      gamesWon,
      gamesLost,
      gameDiff: gamesWon - gamesLost,
      position: 0,
      tiedWithPrevious: false,
    };
  });

  const sorted = rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.setDiff - a.setDiff ||
      b.gameDiff - a.gameDiff ||
      b.gamesWon - a.gamesWon ||
      a.player.localeCompare(b.player),
  );
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    row.position = index + 1;
    row.tiedWithPrevious =
      previous !== undefined &&
      previous.points === row.points &&
      previous.setDiff === row.setDiff &&
      previous.gameDiff === row.gameDiff &&
      previous.gamesWon === row.gamesWon;
  });
  return sorted;
}
