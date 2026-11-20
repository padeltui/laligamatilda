import type { CategoryMove } from '../domain/categories';
import { categoryOf } from '../lib/league';
import { PlayerLink } from './PlayerLink';

/** Lista de ascensos y descensos de categoría de la semana. */
export function CategoryMoves({ moves, nameOf }: { moves: readonly CategoryMove[]; nameOf: (id: string) => string }) {
  if (moves.length === 0) return null;
  return (
    <ul className="moves">
      {moves.map((m) => (
        <li key={m.player}>
          <span className={`arrow ${m.up ? 'up' : 'down'}`}>{m.up ? '▲' : '▼'}</span> <PlayerLink id={m.player}>{nameOf(m.player)}</PlayerLink>{' '}
          {m.up ? 'sube' : 'baja'} a {categoryOf(m.to).medal} {categoryOf(m.to).name}
        </li>
      ))}
    </ul>
  );
}
