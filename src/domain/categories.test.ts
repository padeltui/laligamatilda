import { describe, expect, it } from 'vitest';
import { categorize, categoryMoves, categoryRanking } from './categories';

const players = Array.from({ length: 13 }, (_, i) => ({ id: `p${i + 1}`, nombre: `Jugador ${String(i + 1).padStart(2, '0')}` }));
const ratings = new Map(players.map((p, i) => [p.id, 1200 - i * 10]));

describe('categorize', () => {
  it('4 Oro, 4 Plata y el resto Bronce según el índice', () => {
    const c = categorize(players, ratings);
    expect(players.map((p) => c.get(p.id)!.category).join('')).toBe('AAAABBBBCCCCC');
    expect(c.get('p5')).toEqual({ category: 'B', position: 5 });
  });

  it('sin índice todos cuentan como 1000 y se ordenan por nombre', () => {
    const c = categorize([{ id: 'x', nombre: 'Zoe' }, { id: 'y', nombre: 'Ana' }], new Map());
    expect(c.get('y')).toEqual({ category: 'A', position: 1 });
  });
});

describe('categoryMoves y categoryRanking', () => {
  it('detecta subidas y bajadas', () => {
    const before = categorize(players, ratings);
    const after = categorize(players, new Map([...ratings, ['p5', 1300], ['p9', 1145]]));
    const moves = categoryMoves(before, after);
    expect(moves.filter((m) => m.up).map((m) => [m.player, m.to])).toEqual([['p5', 'A'], ['p9', 'B']]);
    expect(moves.filter((m) => !m.up).map((m) => [m.player, m.to])).toEqual([['p4', 'B'], ['p8', 'C']]);
  });

  it('agrupa por categoría en orden de puesto', () => {
    const ranking = categoryRanking(categorize(players, ratings));
    expect(ranking.get('A')).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(ranking.get('C')).toHaveLength(5);
  });
});
