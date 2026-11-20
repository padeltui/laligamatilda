import { useEffect, useMemo, useState } from 'react';
import { computeElo } from '../domain/elo';
import { leftOut, organizeWeek, recentPartnerCounts, SLOTS, type SlotId, type SwissResult } from '../domain/swiss';
import { changePin, hasPin, openWeek, publishWeek, unpublishWeek, type WeekData } from '../lib/db';
import { currentWeek, errorMessage, formatSlot, historyMatches } from '../lib/league';
import type { League } from '../lib/useLeague';
import { MatchCard } from './MatchCard';

/** Lunes de esta semana si hoy es lunes; si no, el lunes siguiente (AAAA-MM-DD). */
function nextMonday(today = new Date()): string {
  const date = new Date(today);
  const daysToMonday = (8 - date.getDay()) % 7;
  date.setDate(date.getDate() + daysToMonday);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function WeekAdmin({ league }: { league: League }) {
  const data = currentWeek(league.weeks);
  return (
    <>
      {data?.week.estado === 'abierta' ? <OrganizeWeek data={data} league={league} /> : <OpenWeek league={league} last={data} />}
      <PinCard />
    </>
  );
}

function OpenWeek({ league, last }: { league: League; last: WeekData | null }) {
  const [date, setDate] = useState(nextMonday());
  const [error, setError] = useState<string | null>(null);
  const hasResults = last?.matches.some((m) => m.sets.length > 0) ?? false;

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      await league.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="card">
      <h2>Liga suiza</h2>
      {last && (
        <p className="muted">
          Semana {last.week.numero}: {last.matches.length} partidos publicados.
          {!hasResults && ' Si hay que rehacerlos, puedes despublicarla (aún no tiene resultados).'}
        </p>
      )}
      <label className="field">
        Lunes de la semana a abrir
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="buttons">
        <button className="primary" disabled={!date} onClick={() => run(() => openWeek(date))}>
          Abrir inscripción {last ? `de la semana ${last.week.numero + 1}` : 'de la primera semana'}
        </button>
        {last && !hasResults && (
          <button
            className="ghost"
            onClick={() =>
              window.confirm(`¿Despublicar la semana ${last.week.numero}? Se borran sus partidos y se reabre la inscripción.`) && void run(() => unpublishWeek(last.week.id))
            }
          >
            Despublicar semana {last.week.numero}
          </button>
        )}
      </div>
    </section>
  );
}

function OrganizeWeek({ data, league }: { data: WeekData; league: League }) {
  const [proposal, setProposal] = useState<SwissResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => historyMatches(league.history, league.weeks), [league.history, league.weeks]);
  const input = useMemo(() => {
    const previous = league.weeks.find((w) => w.week.estado === 'publicada' && w.week.numero < data.week.numero);
    return {
      availability: new Map([...data.availability].map(([p, slots]) => [p, slots as SlotId[]])),
      ratings: computeElo(matches).ratings,
      recentPartners: recentPartnerCounts(matches),
      priority: previous ? leftOut(previous.availability.keys(), previous.matches) : new Set<string>(),
    };
  }, [data, league.weeks, matches]);

  // Si cambia la inscripción, la propuesta deja de valer.
  useEffect(() => setProposal(null), [data]);

  const organize = () => {
    setError(null);
    setProposal(organizeWeek(input));
  };

  const publish = async () => {
    if (!proposal) return;
    if (!window.confirm(`¿Publicar ${proposal.matches.length} partidos y cerrar la inscripción de la semana ${data.week.numero}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await publishWeek(data.week.id, proposal.matches);
      await league.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h2>Semana {data.week.numero} · inscripción abierta</h2>
      <p className="muted">
        {data.availability.size} apuntados:{' '}
        {SLOTS.map((s) => `${s.label.toLowerCase()} ${[...data.availability.values()].filter((v) => v.includes(s.id)).length}`).join(' · ')}
      </p>
      {input.priority.size > 0 && (
        <p className="muted">Prioridad (sin partido la semana pasada): {[...input.priority].map(league.nameOf).join(', ')}</p>
      )}
      <div className="buttons">
        <button className="primary" onClick={organize} disabled={data.availability.size < 4}>
          {proposal ? 'Otra propuesta' : 'Organizar partidos'}
        </button>
      </div>
      {data.availability.size < 4 && <p className="muted">Hacen falta al menos 4 apuntados.</p>}

      {proposal && (
        <>
          <h3>Propuesta</h3>
          {proposal.matches.length === 0 && <p className="warn">No se puede formar ningún partido con esta disponibilidad.</p>}
          {proposal.matches.map((m, i) => (
            <MatchCard
              key={i}
              match={{ id: String(i), week: data.week.numero, kind: 'S', slot: m.slot, pair1: m.pair1, pair2: m.pair2, estado: 'pendiente', sets: [], updatedAt: '' }}
              nameOf={league.nameOf}
              note={formatSlot(data.week.fecha_inicio, m.slot).split(' · ')[0]}
            />
          ))}
          {proposal.unassigned.length > 0 && <p className="rest">😴 Se quedan sin partido: {proposal.unassigned.map(league.nameOf).join(', ')}</p>}
          <p className="muted">Puedes pedir otra propuesta o publicarla; después de publicar podrás editar cada partido.</p>
          <div className="buttons">
            <button className="primary" onClick={publish} disabled={saving || proposal.matches.length === 0}>
              Publicar partidos
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function PinCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    hasPin()
      .then(setConfigured)
      .catch(() => setConfigured(null));
  }, []);

  const save = async () => {
    setMessage(null);
    try {
      await changePin(pin);
      setConfigured(true);
      setPin('');
      setMessage({ ok: true, text: 'PIN guardado. Compártelo por el grupo.' });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <section className="card">
      <h2>PIN de inscripción</h2>
      <p className="muted">
        {configured === null ? 'Comprobando…' : configured ? 'Hay un PIN configurado. Escribe uno nuevo para cambiarlo.' : '⚠️ Aún no hay PIN: nadie puede apuntarse hasta que lo pongas.'}
      </p>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Nuevo PIN (mín. 4, mejor 6+)" aria-label="Nuevo PIN" />
        <button className="primary" type="submit" disabled={pin.trim().length < 4}>
          Guardar PIN
        </button>
      </form>
      {message && <p className={message.ok ? 'ok' : 'error'}>{message.text}</p>}
    </section>
  );
}
