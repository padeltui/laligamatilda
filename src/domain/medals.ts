import type { SeasonRound } from './season';
import type { PlayerId } from './types';

export interface MedalRow {
  player: PlayerId;
  /** Vueltas o semanas en Oro, Plata y Bronce. */
  gold: number;
  silver: number;
  bronze: number;
  position: number;
  tiedWithPrevious: boolean;
}

const LEVEL: Record<string, 'gold' | 'silver' | 'bronze'> = { A: 'gold', B: 'silver', C: 'bronze' };

/**
 * Medallero histórico, como en las olimpiadas: manda el número de vueltas o semanas en Oro,
 * luego en Plata y luego en Bronce. Con las mismas medallas, empate.
 */
export function medalTable(rounds: readonly SeasonRound[]): MedalRow[] {
  const rows = new Map<PlayerId, MedalRow>();

  for (const { ranking, unplayed } of rounds) {
    for (const [groupId, players] of ranking) {
      const medal = LEVEL[groupId];
      if (!medal || unplayed?.has(groupId)) continue;
      for (const player of players) {
        const row = rows.get(player) ?? { player, gold: 0, silver: 0, bronze: 0, position: 0, tiedWithPrevious: false };
        row[medal] += 1;
        rows.set(player, row);
      }
    }
  }

  const compare = (a: MedalRow, b: MedalRow) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze;
  const sorted = [...rows.values()].sort((a, b) => compare(a, b) || a.player.localeCompare(b.player));
  sorted.forEach((row, i) => {
    row.tiedWithPrevious = i > 0 && compare(sorted[i - 1], row) === 0;
    // Los empatados comparten puesto.
    row.position = row.tiedWithPrevious ? sorted[i - 1].position : i + 1;
  });
  return sorted;
}
