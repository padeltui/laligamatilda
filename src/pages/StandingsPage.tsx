import type { League } from '../lib/useLeague';
import { EloRanking } from './StatsPage';

/** Clasificación de la liga suiza: el Índice Matilda. */
export function StandingsPage({ league }: { league: League }) {
  return <EloRanking league={league} />;
}

export function EmptyRound() {
  return (
    <section className="card welcome">
      <div className="welcomeIcon">🎾</div>
      <h2>Todavía no hay ninguna vuelta</h2>
      <p className="muted">Cuando se sorteen los grupos aparecerán aquí.</p>
    </section>
  );
}
