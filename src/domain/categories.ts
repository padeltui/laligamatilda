import { ELO_START } from './elo';
import type { GroupId, PlayerId } from './types';

/** Cuántos puestos hay en Oro, Plata y Bronce; el resto se queda sin categoría. */
export const CATEGORY_CUTS = [3, 3, 3];
const CATEGORY_IDS: GroupId[] = ['A', 'B', 'C'];

export interface CategoryEntry {
  category: GroupId;
  /** Puesto en el ranking del Índice Matilda (los empatados comparten puesto). */
  position: number;
}

/**
 * Reparte a los jugadores en Oro (A), Plata (B) y Bronce (C) según el Índice Matilda
 * (redondeado, como se ve en la web): los 3 primeros Oro, los 3 siguientes Plata y los
 * 3 siguientes Bronce; el resto no tiene categoría. Los empatados comparten puesto, así
 * que si un empate cae en un corte, todos se quedan en la categoría más alta.
 */
export function categorize(
  players: readonly { id: PlayerId; nombre: string }[],
  ratings: ReadonlyMap<PlayerId, number>,
): Map<PlayerId, CategoryEntry> {
  const score = (id: PlayerId) => Math.round(ratings.get(id) ?? ELO_START);
  const ordered = [...players].sort((a, b) => score(b.id) - score(a.id) || a.nombre.localeCompare(b.nombre));
  const result = new Map<PlayerId, CategoryEntry>();
  let position = 0;
  ordered.forEach((player, i) => {
    // Puesto de competición: los empatados comparten el puesto del primero de ellos.
    if (i === 0 || score(ordered[i - 1].id) !== score(player.id)) position = i + 1;
    let level = 0;
    let limit = CATEGORY_CUTS[0];
    while (level < CATEGORY_CUTS.length && position > limit) {
      level += 1;
      limit += CATEGORY_CUTS[level] ?? 0;
    }
    if (level < CATEGORY_CUTS.length) result.set(player.id, { category: CATEGORY_IDS[level], position });
  });
  return result;
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
