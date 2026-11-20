import { useEffect, useState } from 'react';
import { Avatar, LEAGUE_NAME, Logo } from '../components/Brand';
import { CategoryBadge } from '../components/CategoryBadge';
import { CategoryMoves } from '../components/CategoryMoves';
import { MatchCard } from '../components/MatchCard';
import { categoryMoves } from '../domain/categories';
import { Modal } from '../components/Modal';
import { PlayerLink } from '../components/PlayerLink';
import { ResultForm } from '../components/ResultForm';
import { WeekMatchEditor } from '../components/WeekMatchEditor';
import { SLOTS } from '../domain/swiss';
import { signUp, type RoundMatch, type WeekData } from '../lib/db';
import { currentWeek, errorMessage, formatSlot, slotDate, weekCategories } from '../lib/league';
import type { League } from '../lib/useLeague';
import type { Route } from '../lib/useRoute';

interface Props {
  league: League;
  isAdmin: boolean;
  navigate: (route: Route) => void;
}

export function WeekPage({ league, isAdmin, navigate }: Props) {
  const data = currentWeek(league.weeks);

  return (
    <>
      <header className="hero">
        <div className="brand">
          <Logo size={42} />
          <div>
            <h1>{LEAGUE_NAME}</h1>
            <small>{data ? weekSubtitle(data) : 'Liga suiza'}</small>
          </div>
        </div>
      </header>

      <div className="page">
        {!data ? (
          <section className="card welcome">
            <div className="welcomeIcon">🎾</div>
            <h2>Aún no hay ninguna semana abierta</h2>
            <p className="muted">Cuando se abra la inscripción podrás apuntarte aquí a las franjas en las que puedas jugar.</p>
            {isAdmin && (
              <button className="primary" onClick={() => navigate('admin')}>
                Abrir la primera semana
              </button>
            )}
          </section>
        ) : (
          <WeekMoves league={league} />
        )}
        {!data ? null : data.week.estado === 'abierta' ? (
          <>
            <SignUpCard data={data} league={league} isAdmin={isAdmin} />
            <SignedUpList data={data} nameOf={league.nameOf} />
          </>
        ) : (
          <PublishedWeek data={data} league={league} isAdmin={isAdmin} />
        )}
      </div>
    </>
  );
}

function weekSubtitle(data: WeekData): string {
  const sat = slotDate(data.week.fecha_inicio, 'sab_manana').toLocaleDateString('es', { day: 'numeric', month: 'short' });
  const sun = slotDate(data.week.fecha_inicio, 'dom_manana').toLocaleDateString('es', { day: 'numeric', month: 'short' });
  const state = data.week.estado === 'abierta' ? 'inscripción abierta' : 'partidos publicados';
  return `Semana ${data.week.numero} · ${sat} y ${sun} · ${state}`;
}

const STORAGE_PLAYER = 'ligamatilda.jugador';
const STORAGE_PIN = 'ligamatilda.pin';

function readStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado…): no pasa nada, solo no se recuerda.
  }
}

function SignUpCard({ data, league, isAdmin }: { data: WeekData; league: League; isAdmin: boolean }) {
  const active = league.players.filter((p) => p.activo);
  const [player, setPlayer] = useState(() => {
    const saved = readStorage(STORAGE_PLAYER);
    return active.some((p) => p.id === saved) ? saved : '';
  });
  const [slots, setSlots] = useState<string[]>([]);
  const [pin, setPin] = useState(() => readStorage(STORAGE_PIN));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Al elegir jugador, se cargan sus franjas ya guardadas.
  useEffect(() => {
    setSlots(player ? data.availability.get(player) ?? [] : []);
  }, [player, data]);

  const toggle = (slot: string) => setSlots((current) => (current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot]));
  const saved = player ? data.availability.get(player) ?? [] : [];
  const changed = [...saved].sort().join() !== [...slots].sort().join();

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await signUp(data.week.id, player, slots, pin);
      writeStorage(STORAGE_PLAYER, player);
      if (!isAdmin) writeStorage(STORAGE_PIN, pin);
      await league.refresh();
      setMessage({
        ok: true,
        text: slots.length ? `¡Apuntado! ${SLOTS.filter((s) => slots.includes(s.id)).map((s) => s.label).join(', ')}.` : 'Te has desapuntado de esta semana.',
      });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card signUp">
      <h2>¿Cuándo puedes jugar esta semana?</h2>
      <p className="muted">Marca todas las franjas en las que puedas. El jueves se organizan los partidos.</p>

      <label className="field">
        Soy
        <select value={player} onChange={(e) => setPlayer(e.target.value)}>
          <option value="">Elige tu nombre…</option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>

      {player && (
        <>
          <div className="slotGrid" role="group" aria-label="Franjas">
            {SLOTS.map((slot) => (
              <button key={slot.id} className={`slotToggle${slots.includes(slot.id) ? ' selected' : ''}`} aria-pressed={slots.includes(slot.id)} onClick={() => toggle(slot.id)}>
                <strong>{slot.label}</strong>
                <small>{formatSlot(data.week.fecha_inicio, slot.id).split(' · ')[0]}</small>
              </button>
            ))}
          </div>

          {!isAdmin && (
            <label className="field">
              PIN de la liga
              <input type="password" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="El del grupo de WhatsApp" />
            </label>
          )}

          <div className="buttons">
            <button className="primary" onClick={save} disabled={saving || !changed || (!isAdmin && !pin)}>
              {slots.length === 0 && saved.length > 0 ? 'Desapuntarme' : 'Guardar'}
            </button>
          </div>
        </>
      )}
      {message && <p className={message.ok ? 'ok' : 'error'}>{message.text}</p>}
    </section>
  );
}

function SignedUpList({ data, nameOf }: { data: WeekData; nameOf: (id: string) => string }) {
  const total = data.availability.size;
  return (
    <section className="section">
      <h2 className="sectionTitle">
        Apuntados
        <span className="weekState">
          {total} {total === 1 ? 'jugador' : 'jugadores'}
        </span>
      </h2>
      {total === 0 ? (
        <p className="emptyLine">Todavía no se ha apuntado nadie. ¡Sé el primero! 🎾</p>
      ) : (
        SLOTS.map((slot) => {
          const players = [...data.availability].filter(([, slots]) => slots.includes(slot.id)).map(([p]) => p);
          return (
            <div key={slot.id} className="card slotList">
              <div className="slotListHead">
                <strong>{slot.label}</strong>
                <small>{players.length}</small>
              </div>
              {players.length === 0 ? (
                <span className="muted">Nadie</span>
              ) : (
                <div className="chips">
                  {players.map((p) => (
                    <PlayerLink key={p} id={p}>
                      <span className="personChip">
                        <Avatar id={p} name={nameOf(p)} />
                        {nameOf(p)}
                        <CategoryBadge category={data.categories.get(p)?.category} />
                      </span>
                    </PlayerLink>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}

function PublishedWeek({ data, league, isAdmin }: { data: WeekData; league: League; isAdmin: boolean }) {
  const [editing, setEditing] = useState<{ match: RoundMatch; mode: 'result' | 'edit' } | null>(null);
  const playing = new Set(data.matches.flatMap((m) => [...m.pair1, ...m.pair2]));
  const left = [...data.availability.keys()].filter((p) => !playing.has(p));
  const close = () => setEditing(null);
  const done = async () => {
    close();
    await league.refresh();
  };

  return (
    <>
      {SLOTS.map((slot) => {
        const matches = data.matches.filter((m) => m.slot === slot.id);
        if (matches.length === 0) return null;
        return (
          <section className="section" key={slot.id}>
            <h2 className="sectionTitle">
              {slot.label}
              <span className="weekState">{formatSlot(data.week.fecha_inicio, slot.id).split(' · ')[0]}</span>
            </h2>
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} nameOf={league.nameOf}>
                {isAdmin && (
                  <>
                    <button onClick={() => setEditing({ match, mode: 'result' })}>Resultado</button>
                    <button className="ghost" onClick={() => setEditing({ match, mode: 'edit' })}>
                      Editar
                    </button>
                  </>
                )}
              </MatchCard>
            ))}
          </section>
        );
      })}
      {data.matches.length === 0 && <p className="emptyLine">Esta semana no ha habido gente suficiente para organizar partidos.</p>}
      {left.length > 0 && <p className="rest">😴 Sin partido esta semana: {left.map(league.nameOf).join(', ')}. Tendrán prioridad la próxima.</p>}

      {editing?.mode === 'result' && (
        <Modal title="Resultado" onClose={close}>
          <ResultForm match={editing.match} nameOf={league.nameOf} onDone={done} onCancel={close} />
        </Modal>
      )}
      {editing?.mode === 'edit' && (
        <Modal title="Editar partido" onClose={close}>
          <WeekMatchEditor match={editing.match} data={data} players={league.players} nameOf={league.nameOf} onDone={done} onCancel={close} />
        </Modal>
      )}
    </>
  );
}


/** Ascensos y descensos de categoría respecto a la semana anterior. */
function WeekMoves({ league }: { league: League }) {
  const { current, previous } = weekCategories(league.weeks);
  const moves = categoryMoves(previous, current);
  if (moves.length === 0) return null;
  return (
    <section className="card movesCard">
      <h2>Movimientos de la semana</h2>
      <CategoryMoves moves={moves} nameOf={league.nameOf} />
    </section>
  );
}
