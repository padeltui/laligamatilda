import type { Group, PlayerId } from './types';

/**
 * Grupos de la siguiente vuelta. `ranking` tiene los jugadores de cada grupo
 * ordenados por clasificación final; los grupos van ordenados de mayor a menor nivel.
 * Los `moves` primeros de cada grupo suben y los `moves` últimos bajan.
 * Entre un grupo de `frozen` (p. ej. uno que no ha jugado) y sus vecinos no hay movimientos.
 */
export function nextGroups(
  groups: readonly Group[],
  ranking: ReadonlyMap<string, readonly PlayerId[]>,
  moves = 1,
  frozen: ReadonlySet<string> = new Set(),
): Group[] {
  const ordered = groups.map((group) => {
    const players = ranking.get(group.id);
    if (!players || players.length !== group.players.length || !group.players.every((p) => players.includes(p))) {
      throw new Error(`La clasificación del grupo ${group.id} no coincide con sus jugadores.`);
    }
    if (players.length < 2 * moves) throw new Error(`El grupo ${group.id} es demasiado pequeño para ${moves} ascensos y descensos.`);
    return players;
  });

  // Frontera i: entre el grupo i y el i + 1.
  const open = (i: number) => i >= 0 && i < groups.length - 1 && !frozen.has(groups[i].id) && !frozen.has(groups[i + 1].id);

  return groups.map((group, i) => {
    const current = ordered[i];
    const withUpper = open(i - 1);
    const withLower = open(i);
    const stay = current.slice(withUpper ? moves : 0, withLower ? current.length - moves : current.length);
    const relegated = withUpper ? ordered[i - 1].slice(-moves) : [];
    const promoted = withLower ? ordered[i + 1].slice(0, moves) : [];
    return { id: group.id, players: [...relegated, ...stay, ...promoted] };
  });
}
