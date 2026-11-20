import { useState } from 'react';
import { SLOTS } from '../domain/swiss';
import { updateWeekMatch, type MatchState, type Player, type RoundMatch, type WeekData } from '../lib/db';
import { errorMessage } from '../lib/league';

interface Props {
  match: RoundMatch;
  data: WeekData;
  players: Player[];
  nameOf: (id: string) => string;
  onDone: () => void;
  onCancel: () => void;
}

const SLOT_LABELS = ['Pareja 1 · jugador 1', 'Pareja 1 · jugador 2', 'Pareja 2 · jugador 1', 'Pareja 2 · jugador 2'];

/** Editar un partido de la liga suiza: franja, jugadores (p. ej. un sustituto) o aplazarlo. */
export function WeekMatchEditor({ match, data, players, nameOf, onDone, onCancel }: Props) {
  const [slot, setSlot] = useState(match.slot ?? SLOTS[0].id);
  const [seats, setSeats] = useState<string[]>([...match.pair1, ...match.pair2]);
  const [estado, setEstado] = useState<MatchState>(match.estado);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasResult = match.sets.length > 0;
  const duplicated = new Set(seats).size !== seats.length;
  const busyElsewhere = new Set(data.matches.filter((m) => m.id !== match.id).flatMap((m) => [...m.pair1, ...m.pair2]));
  const warnings = [
    ...seats.filter((p) => busyElsewhere.has(p)).map((p) => `${nameOf(p)} ya juega otro partido esta semana.`),
    ...seats.filter((p) => !(data.availability.get(p) ?? []).includes(slot)).map((p) => `${nameOf(p)} no se apuntó a esta franja.`),
  ];
  const free = [...data.availability].filter(([p, slots]) => slots.includes(slot) && !busyElsewhere.has(p) && !seats.includes(p)).map(([p]) => p);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateWeekMatch({ id: match.id, slot, pair1: [seats[0], seats[1]], pair2: [seats[2], seats[3]], estado });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <div className="form">
      <label>
        Franja
        <select value={slot} onChange={(e) => setSlot(e.target.value)}>
          {SLOTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {seats.map((player, i) => (
        <label key={i}>
          {SLOT_LABELS[i]}
          <select value={player} onChange={(e) => setSeats((current) => current.map((p, j) => (j === i ? e.target.value : p)))}>
            {players
              .filter((p) => p.activo || seats.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        </label>
      ))}

      {!hasResult && (
        <label>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as MatchState)}>
            <option value="pendiente">Pendiente</option>
            <option value="aplazado">Aplazado</option>
          </select>
        </label>
      )}

      <p className="muted">Apuntados a esta franja y sin partido: {free.length ? free.map(nameOf).join(', ') : 'nadie'}</p>
      {duplicated && <p className="warn">Un jugador aparece dos veces.</p>}
      {warnings.length > 0 && (
        <ul className="issues">
          {warnings.map((w) => (
            <li key={w}>⚠️ {w}</li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}

      <div className="buttons">
        <button className="primary" onClick={save} disabled={saving || duplicated}>
          Guardar
        </button>
        <button className="ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
