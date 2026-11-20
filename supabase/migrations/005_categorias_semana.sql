-- Categorías (Oro, Plata, Bronce) de cada jugador en cada semana de la liga suiza.
-- Son solo una etiqueta: se calculan con el Índice Matilda al abrir la semana y se guardan
-- para que el histórico y el medallero no cambien si luego se corrige un resultado.
-- Requiere 004_liga_suiza.sql. Solo añade; no modifica datos existentes.

create table public.semana_categorias (
  semana_id   uuid not null references public.semanas (id) on delete cascade,
  jugador_id  uuid not null references public.jugadores (id) on delete cascade,
  categoria   text not null check (categoria in ('A', 'B', 'C')),
  -- Puesto en el ranking del Índice Matilda al abrir la semana.
  posicion    smallint not null check (posicion > 0),
  primary key (semana_id, jugador_id)
);

alter table public.semana_categorias enable row level security;
grant select on public.semana_categorias to anon, authenticated;
grant insert, update, delete on public.semana_categorias to authenticated;
create policy "lectura publica" on public.semana_categorias for select to anon, authenticated using (true);
create policy "admins insertan" on public.semana_categorias for insert to authenticated with check (public.es_admin());
create policy "admins modifican" on public.semana_categorias for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admins borran" on public.semana_categorias for delete to authenticated using (public.es_admin());

-- abrir_semana ahora guarda también las categorías: [{ "jugador_id": ..., "categoria": "A", "posicion": 1 }, ...]
drop function if exists public.abrir_semana(date);

create or replace function public.abrir_semana(p_fecha_inicio date, p_categorias jsonb)
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

  insert into public.semana_categorias (semana_id, jugador_id, categoria, posicion)
  select v_id, (c ->> 'jugador_id')::uuid, c ->> 'categoria', (c ->> 'posicion')::smallint
  from jsonb_array_elements(coalesce(p_categorias, '[]')) as c;

  return v_id;
end;
$$;

revoke all on function public.abrir_semana(date, jsonb) from public, anon;
grant execute on function public.abrir_semana(date, jsonb) to authenticated;
