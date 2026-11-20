import { describe, expect, it } from 'vitest';
import { seededRng } from './rng';
import { pairKey } from './schedule';
import { balancedPairs, organizeWeek, type SlotId } from './swiss';

const everyone = (players: string[], slots: SlotId[]) => new Map(players.map((p) => [p, slots]));
const ratingsOf = (entries: [string, number][]) => new Map(entries);
const playersIn = (m: { pair1: readonly string[]; pair2: readonly string[] }) => [...m.pair1, ...m.pair2];

describe('balancedPairs', () => {
  it('junta al mejor con el peor contra los dos del medio', () => {
    const r = ratingsOf([['a', 1100], ['b', 1050], ['c', 1000], ['d', 950]]);
    const { pair1, pair2 } = balancedPairs(['a', 'b', 'c', 'd'], (p) => r.get(p)!);
    const pairs = [pair1, pair2].map((p) => [...p].sort().join('+')).sort();
    expect(pairs).toEqual(['a+d', 'b+c']);
  });

  it('evita repetir compañero aunque quede algo menos igualado', () => {
    const r = ratingsOf([['a', 1100], ['b', 1050], ['c', 1000], ['d', 950]]);
    const recent = new Map([[pairKey(['a', 'd']), 1]]);
    const { pair1, pair2 } = balancedPairs(['a', 'b', 'c', 'd'], (p) => r.get(p)!, recent);
    expect([pairKey(pair1), pairKey(pair2)]).not.toContain(pairKey(['a', 'd']));
  });
});

describe('organizeWeek', () => {
  it('con 8 disponibles en la misma franja hace 2 partidos agrupando por nivel', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const ratings = ratingsOf(players.map((p, i) => [p, 1200 - i * 30]));
    const { matches, unassigned } = organizeWeek({ availability: everyone(players, ['sab_manana']), ratings }, { rng: seededRng(1) });
    expect(matches).toHaveLength(2);
    expect(unassigned).toEqual([]);
    const groups = matches.map((m) => playersIn(m).sort().join(',')).sort();
    expect(groups).toEqual(['p1,p2,p3,p4', 'p5,p6,p7,p8']);
  });

  it('respeta la disponibilidad y nadie juega dos partidos', () => {
    const availability = new Map<string, SlotId[]>([
      ['a', ['sab_manana']], ['b', ['sab_manana', 'dom_tarde']], ['c', ['sab_manana']], ['d', ['sab_manana', 'dom_tarde']],
      ['e', ['dom_tarde']], ['f', ['dom_tarde']], ['g', ['dom_tarde', 'sab_manana']], ['h', ['dom_tarde']],
    ]);
    for (const seed of [1, 2, 3, 4, 5]) {
      const { matches } = organizeWeek({ availability, ratings: new Map() }, { rng: seededRng(seed) });
      const all = matches.flatMap(playersIn);
      expect(new Set(all).size).toBe(all.length);
      for (const m of matches) for (const p of playersIn(m)) expect(availability.get(p)).toContain(m.slot);
    }
  });

  it('coloca a los flexibles donde hacen falta para que juegue el máximo de gente', () => {
    // a1-a3 solo pueden el sábado y b1-b3 solo el domingo; x e y pueden los dos días.
    const availability = new Map<string, SlotId[]>([
      ['a1', ['sab_manana']], ['a2', ['sab_manana']], ['a3', ['sab_manana']],
      ['b1', ['dom_manana']], ['b2', ['dom_manana']], ['b3', ['dom_manana']],
      ['x', ['sab_manana', 'dom_manana']], ['y', ['sab_manana', 'dom_manana']],
    ]);
    const { matches, unassigned } = organizeWeek({ availability, ratings: new Map() }, { rng: seededRng(7) });
    expect(matches).toHaveLength(2);
    expect(unassigned).toEqual([]);
  });

  it('si sobran jugadores, juega antes quien tiene prioridad', () => {
    const players = ['a', 'b', 'c', 'd', 'e'];
    const ratings = ratingsOf([['a', 1100], ['b', 1090], ['c', 1080], ['d', 1070], ['e', 700]]);
    const { matches, unassigned } = organizeWeek(
      { availability: everyone(players, ['sab_tarde']), ratings, priority: new Set(['e']) },
      { rng: seededRng(3) },
    );
    expect(matches).toHaveLength(1);
    expect(playersIn(matches[0])).toContain('e');
    expect(unassigned).toHaveLength(1);
  });

  it('con menos de 4 apuntados no hay partidos', () => {
    const { matches, unassigned } = organizeWeek({ availability: everyone(['a', 'b', 'c'], ['dom_manana']), ratings: new Map() });
    expect(matches).toEqual([]);
    expect(unassigned.sort()).toEqual(['a', 'b', 'c']);
  });

  it('con 13 apuntados en varias franjas hace 3 partidos', () => {
    const players = Array.from({ length: 13 }, (_, i) => `j${i + 1}`);
    const slots: SlotId[][] = [['sab_manana', 'dom_manana'], ['sab_tarde'], ['dom_manana', 'dom_tarde'], ['sab_manana', 'sab_tarde', 'dom_tarde']];
    const availability = new Map(players.map((p, i) => [p, slots[i % slots.length]]));
    const ratings = ratingsOf(players.map((p, i) => [p, 900 + i * 15]));
    const { matches, unassigned } = organizeWeek({ availability, ratings }, { rng: seededRng(11) });
    expect(matches).toHaveLength(3);
    expect(unassigned).toHaveLength(1);
  });
});
