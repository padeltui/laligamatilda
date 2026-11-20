import { categoryOf } from '../lib/league';

/** Medalla de la categoría de la semana (Oro, Plata o Bronce), solo como etiqueta. */
export function CategoryBadge({ category }: { category: string | undefined }) {
  if (!category) return null;
  const { medal, name } = categoryOf(category);
  return (
    <span className="categoryBadge" title={`Categoría ${name} esta semana`} aria-label={name}>
      {medal}
    </span>
  );
}
