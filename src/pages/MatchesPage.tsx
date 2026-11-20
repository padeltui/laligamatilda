import { useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { computeElo } from '../domain/elo';
import type { RoundMatch } from '../lib/db';
import { historyMatches } from '../lib/league';
import type { League } from '../lib/useLeague';
import { CalendarPage } from './CalendarPage';
import { Delta } from './StatsPage';

/** Histórico de partidos jugados, con filtro por jugador y por periodo (semana o vuelta). */
export function MatchesPage({ league, isAdmin }: { league: League; isAdmin: boolean }) {
  const [player, setPlayer] = useState('');
  const [period, setPeriod] = useState('todo');

  const matches = useMemo(() => historyMatches(league.history, league.weeks), [league.history, league.weeks]);
  const elo = useMemo(() => computeElo(matches), [matches]);
  const byId = useMemo(
    () => new Map([...league.history.flatMap((d) => d.matches), ...league.weeks.flatMap((w) => w.matches)].map((m) => [m.id, m as RoundMatch])),
    [league.history, league.weeks],
  );

  // Una vuelta se muestra con su calendario completo (incluidos pendientes y edición), como antes.
  const roundData = period.startsWith('vuelta:') ? league.history.find((d) => d.round.id === period.slice(7)) : undefined;

  const weekIds = new Set(period.startsWith('semana:') ? league.weeks.filter((w) => w.week.id === period.slice(7)).flatMap((w) => w.matches.map((m) => m.id)) : []);
  const filtered = matches
    .filter((m) => !player || m.pair1.includes(player) || m.pair2.includes(player))
    .filter((m) => period === 'todo' || weekIds.has(m.id))
    .sort((a, b) => b.round - a.round || b.week - a.week || b.playedAt.localeCompare(a.playedAt));

  const deltas = new Map((player ? elo.changes.get(player) ?? [] : []).map((c) => [c.matchId, c.delta]));
  const won = player
    ? filtered.filter((m) => {
        const match = byId.get(m.id);
        if (!match) return false;
        const mine = m.pair1.includes(player) ? 1 : 2;
        const sets1 = m.sets.filter((s) => s.pair1 > s.pair2).length;
        return (sets1 >= 2 ? 1 : 2) === mine;
      }).length
    : 0;

  return (
    <>
      <div className="filters">
        <select value={player} onChange={(e) => setPlayer(e.target.value)} aria-label="Jugador">
          <option value="">Todos los jugadores</option>
          {league.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Periodo">
          <option value="todo">Todos los partidos</option>
          {league.weeks.length > 0 && (
            <optgroup label="Liga suiza">
              {league.weeks.map((w) => (
                <option key={w.week.id} value={`semana:${w.week.id}`}>
                  Semana {w.week.numero}
                </option>
              ))}
            </optgroup>
          )}
          {league.rounds.length > 0 && (
            <optgroup label="Vueltas">
              {league.rounds.map((r) => (
                <option key={r.id} value={`vuelta:${r.id}`}>
                  Vuelta {r.numero}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {roundData ? (
        <CalendarPage data={roundData} players={league.players} nameOf={league.nameOf} isAdmin={isAdmin} onChanged={() => league.refresh()} />
      ) : (
        <>
          {player && filtered.length > 0 && (
            <p className="muted">
              {league.nameOf(player)}: {filtered.length} partidos, {won} ganados y {filtered.length - won} perdidos.
            </p>
          )}
          {filtered.length === 0 ? (
            <p className="emptyLine">No hay partidos jugados con este filtro.</p>
          ) : (
            filtered.map((m) => {
              const match = byId.get(m.id);
              if (!match) return null;
              return (
                <MatchCard key={m.id} match={match} nameOf={league.nameOf} note={m.label}>
                  {player && <Delta value={deltas.get(m.id) ?? null} />}
                </MatchCard>
              );
            })
          )}
        </>
      )}
    </>
  );
}
