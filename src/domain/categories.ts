import { ELO_START } from './elo';
import type { GroupId, PlayerId } from './types';

/** Cuántos jugadores hay en Oro y en Plata; el resto, Bronce. */
export const CATEGORY_CUTS = [4, 4];
const CATEGORY_IDS: GroupId[] = ['A', 'B', 'C'];

export interface CategoryEntry {
  category: GroupId;
  /** Puesto en el ranking del Índice Matilda. */
  position: number;
}

/**
 * Reparte a los jugadores en Oro (A), Plata (B) y Bronce (C) según el Índice Matilda:
 * los 4 primeros Oro, los 4 siguientes Plata y el resto Bronce. A igualdad de índice, por nombre.
 */
export function categorize(
  players: readonly { id: PlayerId; nombre: string }[],
  ratings: ReadonlyMap<PlayerId, number>,
): Map<PlayerId, CategoryEntry> {
  const ordered = [...players].sort(
    (a, b) => (ratings.get(b.id) ?? ELO_START) - (ratings.get(a.id) ?? ELO_START) || a.nombre.localeCompare(b.nombre),
  );
  return new Map(
    ordered.map((player, i) => {
      let level = 0;
      let limit = CATEGORY_CUTS[0];
      while (level < CATEGORY_CUTS.length && i >= limit) {
        level += 1;
        limit += CATEGORY_CUTS[level] ?? Infinity;
      }
      return [player.id, { category: CATEGORY_IDS[level], position: i + 1 }];
    }),
  );
}

export interface CategoryMove {
  player: PlayerId;
  from: GroupId;
  to: GroupId;
  up: boolean;
}

/** Quién ha cambiado de categoría entre dos semanas (los que no estaban antes no cuentan). */
export function categoryMoves(previous: ReadonlyMap<PlayerId, CategoryEntry>, current: ReadonlyMap<PlayerId, CategoryEntry>): CategoryMove[] {
  return [...current]
    .filter(([player, entry]) => previous.has(player) && previous.get(player)!.category !== entry.category)
    .map(([player, entry]) => {
      const from = previous.get(player)!.category;
      return { player, from, to: entry.category, up: entry.category < from };
    })
    .sort((a, b) => Number(b.up) - Number(a.up) || a.to.localeCompare(b.to));
}

/** Foto de una semana en el formato del medallero: jugadores de cada categoría por puesto. */
export function categoryRanking(categories: ReadonlyMap<PlayerId, CategoryEntry>): Map<GroupId, PlayerId[]> {
  const ranking = new Map<GroupId, PlayerId[]>();
  for (const [player, entry] of [...categories].sort((a, b) => a[1].position - b[1].position)) {
    ranking.set(entry.category, [...(ranking.get(entry.category) ?? []), player]);
  }
  return ranking;
}
