-- =====================================================================
-- ViajaYa - Esquema PostgreSQL (Supabase)
-- Ejecutar completo en: Supabase > SQL Editor
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.destinos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (char_length(trim(nombre)) > 0),
  descripcion      text not null default '',
  precio_base      numeric(10,2) not null check (precio_base > 0),       -- RF-07
  capacidad_diaria integer       not null check (capacidad_diaria > 0),  -- RF-07 / RN-01
  activo           boolean       not null default true,
  created_at       timestamptz   not null default now()
);

create table if not exists public.reservas (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,                                   -- RF-03
  destino_id      uuid not null references public.destinos(id),
  fecha_viaje     date not null,
  personas        integer not null check (personas > 0),
  nombre_cliente  text not null,
  correo_cliente  text not null,
  monto_subtotal  numeric(12,2) not null check (monto_subtotal >= 0),
  monto_iva       numeric(12,2) not null check (monto_iva >= 0),         -- RN-03 (13 %)
  monto_total     numeric(12,2) not null check (monto_total >= 0),
  estado_reserva  text not null default 'Pendiente'
                  check (estado_reserva in ('Pendiente','Aprobada','Cancelada')),
  estado_pago     text not null default 'Pendiente'
                  check (estado_pago in ('Pendiente','Aprobado','Rechazado')),  -- RF-09
  tarjeta_ultimos4 char(4),                                               -- nunca se guarda el número completo
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_reservas_cupo   on public.reservas (destino_id, fecha_viaje) where estado_reserva <> 'Cancelada';
create index if not exists idx_reservas_correo on public.reservas (lower(correo_cliente));

create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists reservas_updated_at on public.reservas;
create trigger reservas_updated_at before update on public.reservas
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- RN-01 atómica: bloquea la fila del destino para evitar sobrecupos
-- cuando llegan solicitudes simultáneas.
-- ---------------------------------------------------------------------
create or replace function public.crear_reserva_atomica(
  p_destino uuid, p_fecha date, p_personas integer, p_codigo text,
  p_nombre text, p_correo text, p_subtotal numeric, p_iva numeric,
  p_total numeric, p_estado_pago text, p_ultimos4 text
) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare
  v_cap  integer;
  v_ocup integer;
  v_row  public.reservas;
begin
  select capacidad_diaria into v_cap
    from public.destinos where id = p_destino and activo for update;
  if not found then raise exception 'DESTINO_NO_DISPONIBLE'; end if;

  select coalesce(sum(personas), 0) into v_ocup
    from public.reservas
   where destino_id = p_destino and fecha_viaje = p_fecha and estado_reserva <> 'Cancelada';

  if v_ocup + p_personas > v_cap then raise exception 'CUPO_EXCEDIDO'; end if;

  insert into public.reservas
    (codigo, destino_id, fecha_viaje, personas, nombre_cliente, correo_cliente,
     monto_subtotal, monto_iva, monto_total, estado_pago, tarjeta_ultimos4)
  values
    (p_codigo, p_destino, p_fecha, p_personas, p_nombre, lower(p_correo),
     p_subtotal, p_iva, p_total, p_estado_pago, p_ultimos4)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.mover_reserva_atomica(p_reserva uuid, p_nueva_fecha date)
returns public.reservas
language plpgsql security definer set search_path = public as $$
declare
  v_res  public.reservas;
  v_cap  integer;
  v_ocup integer;
begin
  select * into v_res from public.reservas where id = p_reserva for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;

  select capacidad_diaria into v_cap from public.destinos where id = v_res.destino_id for update;

  select coalesce(sum(personas), 0) into v_ocup
    from public.reservas
   where destino_id = v_res.destino_id and fecha_viaje = p_nueva_fecha
     and estado_reserva <> 'Cancelada' and id <> p_reserva;

  if v_ocup + v_res.personas > v_cap then raise exception 'CUPO_EXCEDIDO'; end if;

  update public.reservas set fecha_viaje = p_nueva_fecha where id = p_reserva returning * into v_res;
  return v_res;
end $$;

-- Solo el backend (service_role) puede ejecutar las funciones críticas
revoke all on function public.crear_reserva_atomica(uuid,date,integer,text,text,text,numeric,numeric,numeric,text,text) from public, anon, authenticated;
revoke all on function public.mover_reserva_atomica(uuid,date) from public, anon, authenticated;
grant execute on function public.crear_reserva_atomica(uuid,date,integer,text,text,text,numeric,numeric,numeric,text,text) to service_role;
grant execute on function public.mover_reserva_atomica(uuid,date) to service_role;

-- ---------------------------------------------------------------------
-- Row Level Security
-- El backend usa la service key (omite RLS). Estas políticas protegen el
-- acceso directo con la anon key desde cualquier cliente.
-- ---------------------------------------------------------------------
alter table public.destinos enable row level security;
alter table public.reservas enable row level security;

drop policy if exists destinos_lectura_publica on public.destinos;
create policy destinos_lectura_publica on public.destinos
  for select to anon, authenticated using (activo = true);

drop policy if exists destinos_admin_total on public.destinos;
create policy destinos_admin_total on public.destinos
  for all to authenticated
  using      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- reservas: sin política para anon => un turista nunca puede leer ni escribir directo
drop policy if exists reservas_admin_total on public.reservas;
create policy reservas_admin_total on public.reservas
  for all to authenticated
  using      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------------------------------------------------------------------
-- Para crear el administrador: Supabase > Authentication > Users > Add user
-- y luego ejecutar (cambiar el correo):
--   update auth.users
--      set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
--    where email = 'admin@suagencia.com';
-- ---------------------------------------------------------------------
