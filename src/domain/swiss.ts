import { ELO_START } from './elo';
import { chronological } from './history';
import { shuffle, type Rng } from './rng';
import { pairKey } from './schedule';
import type { HistoryMatch, Pair, PlayerId } from './types';

/** Franjas fijas en las que se puede jugar cada semana. */
export const SLOTS = [
  { id: 'sab_manana', label: 'Sábado mañana' },
  { id: 'sab_tarde', label: 'Sábado tarde' },
  { id: 'dom_manana', label: 'Domingo mañana' },
  { id: 'dom_tarde', label: 'Domingo tarde' },
] as const;

export type SlotId = (typeof SLOTS)[number]['id'];

export function slotLabel(slot: string): string {
  return SLOTS.find((s) => s.id === slot)?.label ?? slot;
}

export interface SwissInput {
  /** Franjas en las que puede jugar cada jugador apuntado. */
  availability: ReadonlyMap<PlayerId, readonly SlotId[]>;
  /** Índice Matilda actual; quien no tenga, cuenta como ELO_START. */
  ratings: ReadonlyMap<PlayerId, number>;
  /** Parejas que ya jugaron juntas hace poco (clave de pairKey → nº de veces). */
  recentPartners?: ReadonlyMap<string, number>;
  /** Jugadores que se quedaron sin jugar la última vez: tienen prioridad. */
  priority?: ReadonlySet<PlayerId>;
}

export interface SwissMatch {
  slot: SlotId;
  pair1: Pair;
  pair2: Pair;
}

export interface SwissResult {
  matches: SwissMatch[];
  /** Apuntados que se quedan sin partido. */
  unassigned: PlayerId[];
}

// Pesos de la puntuación de una propuesta: lo primero es que juegue el máximo de gente.
const PLAYING_WEIGHT = 10_000;
const PRIORITY_WEIGHT = 1_000;
const REPEATED_PARTNER_PENALTY = 300;

/**
 * Organiza los partidos de la semana: como mucho un partido por persona, los 4 jugadores
 * de cada partido disponibles en su franja y de nivel parecido, y las parejas equilibradas
 * (evitando repetir compañero reciente). Prueba muchas combinaciones al azar y se queda
 * con la mejor: primero la que hace jugar a más gente, luego la que da prioridad a quien
 * no jugó la última vez y luego la de partidos más igualados.
 */
export function organizeWeek(input: SwissInput, options: { rng?: Rng; attempts?: number } = {}): SwissResult {
  const rng = options.rng ?? Math.random;
  const attempts = options.attempts ?? 2_000;
  let best: { matches: SwissMatch[]; score: number } | null = null;

  for (let i = 0; i < attempts; i++) {
    const matches = buildAttempt(input, rng);
    const score = scoreOf(matches, input);
    if (!best || score > best.score) best = { matches, score };
  }

  const matches = best?.matches ?? [];
  const playing = new Set(matches.flatMap((m) => [...m.pair1, ...m.pair2]));
  return {
    matches: [...matches].sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot)),
    unassigned: [...input.availability.keys()].filter((p) => !playing.has(p)),
  };
}

function buildAttempt(input: SwissInput, rng: Rng): SwissMatch[] {
  const rating = (p: PlayerId) => input.ratings.get(p) ?? ELO_START;
  const flexibility = (p: PlayerId) => input.availability.get(p)?.length ?? 0;
  const assigned = new Set<PlayerId>();
  const matches: SwissMatch[] = [];

  for (const slot of shuffle(SLOTS.map((s) => s.id), rng)) {
    const pool = () =>
      [...input.availability]
        .filter(([player, slots]) => slots.includes(slot) && !assigned.has(player))
        .map(([player]) => player);

    while (pool().length >= 4) {
      // A veces se deja la franja sin llenar para que los jugadores flexibles sirvan en otra.
      if (rng() < 0.1) break;
      const available = pool();
      // El ancla: primero los prioritarios y los que menos franjas tienen.
      const anchor = [...available].sort(
        (a, b) =>
          Number(input.priority?.has(b) ?? false) - Number(input.priority?.has(a) ?? false) ||
          flexibility(a) - flexibility(b) ||
          rng() - 0.5,
      )[0];
      // Los 3 más cercanos en nivel, con algo de azar para explorar alternativas.
      const others = available
        .filter((p) => p !== anchor)
        .map((p) => ({ p, distance: Math.abs(rating(p) - rating(anchor)) + rng() * 120 }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3)
        .map((x) => x.p);
      const four = [anchor, ...others];
      four.forEach((p) => assigned.add(p));
      matches.push({ slot, ...balancedPairs(four, rating, input.recentPartners) });
    }
  }
  return matches;
}

/** De las 3 formas de hacer parejas, la más igualada y sin compañeros repetidos. */
export function balancedPairs(
  [a, b, c, d]: readonly PlayerId[],
  rating: (p: PlayerId) => number,
  recentPartners: ReadonlyMap<string, number> = new Map(),
): { pair1: Pair; pair2: Pair } {
  const options: [Pair, Pair][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
  const cost = ([p1, p2]: [Pair, Pair]) =>
    Math.abs(rating(p1[0]) + rating(p1[1]) - rating(p2[0]) - rating(p2[1])) +
    REPEATED_PARTNER_PENALTY * ((recentPartners.get(pairKey(p1)) ?? 0) + (recentPartners.get(pairKey(p2)) ?? 0));
  const [pair1, pair2] = [...options].sort((x, y) => cost(x) - cost(y))[0];
  return { pair1, pair2 };
}

function scoreOf(matches: readonly SwissMatch[], input: SwissInput): number {
  const rating = (p: PlayerId) => input.ratings.get(p) ?? ELO_START;
  let score = 0;
  for (const match of matches) {
    const four = [...match.pair1, ...match.pair2];
    score += 4 * PLAYING_WEIGHT;
    score += four.filter((p) => input.priority?.has(p)).length * PRIORITY_WEIGHT;
    const ratings = four.map(rating);
    score -= Math.max(...ratings) - Math.min(...ratings);
    score -= Math.abs(rating(match.pair1[0]) + rating(match.pair1[1]) - rating(match.pair2[0]) - rating(match.pair2[1]));
    score -= REPEATED_PARTNER_PENALTY * ((input.recentPartners?.get(pairKey(match.pair1)) ?? 0) + (input.recentPartners?.get(pairKey(match.pair2)) ?? 0));
  }
  return score;
}

function slotIndex(slot: string): number {
  return SLOTS.findIndex((s) => s.id === slot);
}

/** Cuántas veces ha sido pareja cada dupla en los últimos `limit` partidos con resultado. */
export function recentPartnerCounts(matches: readonly HistoryMatch[], limit = 24): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of chronological(matches).slice(-limit)) {
    for (const pair of [match.pair1, match.pair2]) counts.set(pairKey(pair), (counts.get(pairKey(pair)) ?? 0) + 1);
  }
  return counts;
}

/** Apuntados a una semana que se quedaron sin partido. */
export function leftOut(available: Iterable<PlayerId>, matches: readonly { pair1: Pair; pair2: Pair }[]): Set<PlayerId> {
  const playing = new Set(matches.flatMap((m) => [...m.pair1, ...m.pair2]));
  return new Set([...available].filter((p) => !playing.has(p)));
}
