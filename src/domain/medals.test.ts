import { describe, expect, it } from 'vitest';
import { medalTable } from './medals';

const round = (n: number, A: string[], B: string[], C: string[]) => ({ round: n, ranking: new Map([['A', A], ['B', B], ['C', C]]) });

describe('medalTable', () => {
  const rounds = [
    round(1, ['marcos', 'lucia', 'x1', 'x2'], ['ivan', 'y1', 'y2', 'y3'], ['z1', 'z2', 'z3', 'z4']),
    round(2, ['marcos', 'lucia', 'ivan', 'x1'], ['x2', 'y1', 'y2', 'y3'], ['z1', 'z2', 'z3', 'z4']),
  ];

  it('cuenta vueltas en cada grupo', () => {
    const marcos = medalTable(rounds).find((r) => r.player === 'marcos')!;
    expect(marcos).toMatchObject({ gold: 2, silver: 0, bronze: 0 });
    const ivan = medalTable(rounds).find((r) => r.player === 'ivan')!;
    expect(ivan).toMatchObject({ gold: 1, silver: 1, bronze: 0 });
  });

  it('ordena como en las olimpiadas: un oro vale más que muchas platas', () => {
    const table = medalTable([
      round(1, ['a', 'p1', 'p2', 'p3'], ['b', 'q1', 'q2', 'q3'], ['c', 'r1', 'r2', 'r3']),
      round(2, ['p1', 'p2', 'p3', 'q1'], ['b', 'a', 'q2', 'q3'], ['c', 'r1', 'r2', 'r3']),
      round(3, ['p1', 'p2', 'p3', 'q1'], ['b', 'q2', 'q3', 'r1'], ['a', 'c', 'r2', 'r3']),
    ]);
    const pos = (p: string) => table.find((r) => r.player === p)!.position;
    // a: 1 oro, 1 plata, 1 bronce; b: 3 platas → a va delante.
    expect(pos('a')).toBeLessThan(pos('b'));
  });

  it('con las mismas medallas hay empate y comparten puesto', () => {
    const table = medalTable(rounds);
    // marcos, lucia y x1: 2 oros cada uno; ivan y x2: 1 oro y 1 plata.
    expect(table.slice(0, 3).map((r) => r.player).sort()).toEqual(['lucia', 'marcos', 'x1']);
    expect(table.slice(0, 3).map((r) => r.position)).toEqual([1, 1, 1]);
    expect(table[1].tiedWithPrevious).toBe(true);
    expect(table[3].position).toBe(4);
  });

  it('quien no tiene categoría esa semana no suma medalla', () => {
    const week = { round: 1001, ranking: new Map([['A', ['a']], ['B', ['b']], ['C', ['c']]]) };
    const table = medalTable([week]);
    expect(table.map((r) => r.player)).toEqual(['a', 'b', 'c']);
    expect(table.find((r) => r.player === 'c')).toMatchObject({ gold: 0, silver: 0, bronze: 1 });
  });

  it('sin vueltas cerradas está vacío', () => {
    expect(medalTable([])).toEqual([]);
  });

  it('los grupos no disputados no dan medalla, y Oro sigue siendo oro', () => {
    const table = medalTable([{ ...rounds[0], unplayed: new Set(['C']) }]);
    expect(table.some((r) => r.player === 'z1')).toBe(false);
    expect(table.find((r) => r.player === 'marcos')).toMatchObject({ gold: 1 });
    expect(table.find((r) => r.player === 'ivan')).toMatchObject({ silver: 1 });
  });
});
