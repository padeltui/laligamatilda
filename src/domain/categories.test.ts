import { describe, expect, it } from 'vitest';
import { categorize, categoryMoves, categoryRanking } from './categories';

const players = Array.from({ length: 13 }, (_, i) => ({ id: `p${i + 1}`, nombre: `Jugador ${String(i + 1).padStart(2, '0')}` }));
const ratings = new Map(players.map((p, i) => [p.id, 1200 - i * 10]));

describe('categorize', () => {
  it('3 Oro, 3 Plata, 3 Bronce y el resto sin categoría', () => {
    const c = categorize(players, ratings);
    expect(players.map((p) => c.get(p.id)?.category ?? '-').join('')).toBe('AAABBBCCC----');
    expect(c.get('p4')).toEqual({ category: 'B', position: 4 });
    expect(c.has('p10')).toBe(false);
  });

  it('los empatados en un corte se quedan todos en la categoría más alta', () => {
    // p3, p4 y p5 empatan en el 3er puesto: los tres Oro; la Plata empieza en el 6º.
    const tied = new Map([...ratings, ['p4', 1180], ['p5', 1180]]);
    const c = categorize(players, tied);
    expect(['p3', 'p4', 'p5'].map((p) => c.get(p))).toEqual(Array(3).fill({ category: 'A', position: 3 }));
    expect(c.get('p6')).toEqual({ category: 'B', position: 6 });
    // Empate en el último corte: p9 y p10 son los dos Bronce.
    const c2 = categorize(players, new Map([...ratings, ['p10', 1120]]));
    expect(c2.get('p10')).toEqual({ category: 'C', position: 9 });
    expect(c2.has('p11')).toBe(false);
  });

  it('compara el índice redondeado, como se ve en la web', () => {
    const c = categorize(players.slice(0, 4), new Map([['p1', 1100.2], ['p2', 1099.9], ['p3', 1000], ['p4', 990]]));
    expect(c.get('p2')!.position).toBe(1);
  });

  it('sin índice todos cuentan como 1000, empatados', () => {
    const c = categorize([{ id: 'x', nombre: 'Zoe' }, { id: 'y', nombre: 'Ana' }], new Map());
    expect(c.get('y')).toEqual({ category: 'A', position: 1 });
    expect(c.get('x')).toEqual({ category: 'A', position: 1 });
  });
});

describe('categoryMoves y categoryRanking', () => {
  it('detecta subidas y bajadas', () => {
    const before = categorize(players, ratings);
    const after = categorize(players, new Map([...ratings, ['p5', 1300], ['p8', 1155]]));
    const moves = categoryMoves(before, after);
    expect(moves.filter((m) => m.up).map((m) => [m.player, m.to])).toEqual([['p5', 'A'], ['p8', 'B']]);
    expect(moves.filter((m) => !m.up).map((m) => [m.player, m.to])).toEqual([['p3', 'B'], ['p6', 'C']]);
  });

  it('agrupa por categoría en orden de puesto', () => {
    const ranking = categoryRanking(categorize(players, ratings));
    expect(ranking.get('A')).toEqual(['p1', 'p2', 'p3']);
    expect(ranking.get('C')).toHaveLength(3);
  });
});
