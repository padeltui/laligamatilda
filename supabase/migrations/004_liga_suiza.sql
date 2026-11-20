-- Liga suiza: semanas con inscripción por franjas y partidos organizados por la web.
-- Solo añade tablas, columnas y funciones; no modifica ni borra datos existentes.

create extension if not exists pgcrypto with schema extensions;

-- Semanas: se abren (inscripción), se publican los partidos y quedan en el histórico.
create table public.semanas (
  id            uuid primary key default gen_random_uuid(),
  numero        integer not null unique check (numero > 0),
  -- Lunes de la semana; las franjas son el sábado y el domingo siguientes.
  fecha_inicio  date not null,
  estado        text not null default 'abierta' check (estado in ('abierta', 'publicada')),
  creado_en     timestamptz not null default now()
);

-- Solo puede haber una semana con la inscripción abierta.
create unique index semanas_una_abierta on public.semanas ((true)) where estado = 'abierta';

-- Franjas en las que puede jugar cada jugador cada semana.
create table public.disponibilidad (
  semana_id   uuid not null references public.semanas (id) on delete cascade,
  jugador_id  uuid not null references public.jugadores (id) on delete cascade,
  franja      text not null check (franja in ('sab_manana', 'sab_tarde', 'dom_manana', 'dom_tarde')),
  creado_en   timestamptz not null default now(),
  primary key (semana_id, jugador_id, franja)
);

-- Ajustes privados (p. ej. el PIN cifrado). Sin reglas de acceso: solo lo leen las funciones.
create table public.ajustes (
  clave  text primary key,
  valor  text not null
);

-- Los partidos pueden ser de una vuelta (como hasta ahora) o de una semana de la liga suiza.
alter table public.partidos alter column vuelta_id drop not null;
alter table public.partidos add column semana_id uuid references public.semanas (id) on delete cascade;
alter table public.partidos add column franja text check (franja in ('sab_manana', 'sab_tarde', 'dom_manana', 'dom_tarde'));
alter table public.partidos add constraint partidos_vuelta_o_semana check ((vuelta_id is null) <> (semana_id is null));
create index partidos_semana_idx on public.partidos (semana_id);

-- Permisos (RLS)
alter table public.semanas        enable row level security;
alter table public.disponibilidad enable row level security;
alter table public.ajustes        enable row level security;

grant select on public.semanas, public.disponibilidad to anon, authenticated;
grant insert, update, delete on public.semanas, public.disponibilidad to authenticated;

create policy "lectura publica" on public.semanas for select to anon, authenticated using (true);
create policy "admins insertan" on public.semanas for insert to authenticated with check (public.es_admin());
create policy "admins modifican" on public.semanas for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admins borran" on public.semanas for delete to authenticated using (public.es_admin());

-- La disponibilidad se ve públicamente; para escribirla, los jugadores usan apuntarse() con el PIN.
create policy "lectura publica" on public.disponibilidad for select to anon, authenticated using (true);
create policy "admins insertan" on public.disponibilidad for insert to authenticated with check (public.es_admin());
create policy "admins borran" on public.disponibilidad for delete to authenticated using (public.es_admin());

-- ¿Hay PIN configurado? (no revela cuál es)
create or replace function public.hay_pin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ajustes where clave = 'pin');
$$;

-- Cambia el PIN de inscripción (solo admins). Se guarda cifrado.
create or replace function public.cambiar_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden cambiar el PIN.';
  end if;
  if p_pin is null or length(trim(p_pin)) < 4 then
    raise exception 'El PIN debe tener al menos 4 caracteres.';
  end if;
  insert into public.ajustes (clave, valor)
  values ('pin', extensions.crypt(trim(p_pin), extensions.gen_salt('bf')))
  on conflict (clave) do update set valor = excluded.valor;
end;
$$;

-- Guarda las franjas de un jugador en la semana abierta (sustituye las anteriores).
-- Con una lista vacía se desapunta. Los admins no necesitan PIN.
create or replace function public.apuntarse(p_semana uuid, p_jugador uuid, p_franjas text[], p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if not public.es_admin() then
    select valor into v_hash from public.ajustes where clave = 'pin';
    if v_hash is null or p_pin is null or extensions.crypt(trim(p_pin), v_hash) <> v_hash then
      perform pg_sleep(1); -- frena a quien intente adivinar el PIN
      raise exception 'PIN incorrecto.';
    end if;
  end if;
  if not exists (select 1 from public.semanas where id = p_semana and estado = 'abierta') then
    raise exception 'La inscripción de esta semana está cerrada.';
  end if;
  if not exists (select 1 from public.jugadores where id = p_jugador and activo) then
    raise exception 'Jugador no válido.';
  end if;

  delete from public.disponibilidad where semana_id = p_semana and jugador_id = p_jugador;
  insert into public.disponibilidad (semana_id, jugador_id, franja)
  select p_semana, p_jugador, f from unnest(coalesce(p_franjas, '{}')) as f;
end;
$$;

-- Abre la inscripción de una semana nueva (solo admins).
create or replace function public.abrir_semana(p_fecha_inicio date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden abrir semanas.';
  end if;
  if exists (select 1 from public.semanas where estado = 'abierta') then
    raise exception 'Ya hay una semana con la inscripción abierta.';
  end if;
  insert into public.semanas (numero, fecha_inicio)
  select coalesce(max(numero), 0) + 1, p_fecha_inicio from public.semanas
  returning id into v_id;
  return v_id;
end;
$$;

-- Publica los partidos de la semana y cierra la inscripción:
-- [{ "franja": ..., "pareja1_j1": ..., "pareja1_j2": ..., "pareja2_j1": ..., "pareja2_j2": ... }, ...]
create or replace function public.publicar_semana(p_semana uuid, p_partidos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_numero integer;
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden publicar partidos.';
  end if;
  select numero into v_numero from public.semanas where id = p_semana and estado = 'abierta';
  if v_numero is null then
    raise exception 'La semana no está abierta.';
  end if;

  insert into public.partidos (semana_id, semana, tipo, franja, pareja1_j1, pareja1_j2, pareja2_j1, pareja2_j2)
  select p_semana, v_numero, 'S', p ->> 'franja',
         (p ->> 'pareja1_j1')::uuid, (p ->> 'pareja1_j2')::uuid,
         (p ->> 'pareja2_j1')::uuid, (p ->> 'pareja2_j2')::uuid
  from jsonb_array_elements(p_partidos) as p;

  update public.semanas set estado = 'publicada' where id = p_semana;
end;
$$;

-- Deshace la publicación (solo si aún no hay resultados): borra sus partidos y reabre la inscripción.
create or replace function public.despublicar_semana(p_semana uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden despublicar.';
  end if;
  if exists (select 1 from public.semanas where estado = 'abierta') then
    raise exception 'Ya hay otra semana con la inscripción abierta.';
  end if;
  if exists (select 1 from public.partidos p join public.sets s on s.partido_id = p.id where p.semana_id = p_semana) then
    raise exception 'La semana ya tiene resultados; no se puede despublicar.';
  end if;
  delete from public.partidos where semana_id = p_semana;
  update public.semanas set estado = 'abierta' where id = p_semana;
end;
$$;

revoke all on function public.cambiar_pin(text) from public, anon;
revoke all on function public.abrir_semana(date) from public, anon;
revoke all on function public.publicar_semana(uuid, jsonb) from public, anon;
revoke all on function public.despublicar_semana(uuid) from public, anon;
grant execute on function public.hay_pin() to anon, authenticated;
grant execute on function public.apuntarse(uuid, uuid, text[], text) to anon, authenticated;
grant execute on function public.cambiar_pin(text) to authenticated;
grant execute on function public.abrir_semana(date) to authenticated;
grant execute on function public.publicar_semana(uuid, jsonb) to authenticated;
grant execute on function public.despublicar_semana(uuid) to authenticated;
