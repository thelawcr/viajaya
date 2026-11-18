-- Ejecutar UNA vez en Supabase > SQL Editor si ya había creado las tablas con la versión anterior de schema.sql

-- ---------------------------------------------------------------------
-- Auditoría (trazabilidad): quién hizo qué y cuándo.
-- Es de solo agregar: un trigger impide modificar o borrar entradas.
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor      text not null,                 -- correo del admin o 'cliente:correo'
  accion     text not null,                 -- p. ej. RESERVA_APROBADA
  entidad    text not null,                 -- 'reserva' | 'destino'
  entidad_id text,                          -- sin FK: sobrevive a la eliminación de la reserva
  detalle    jsonb not null default '{}'::jsonb
);

create index if not exists idx_auditoria_fecha on public.auditoria (created_at desc);

create or replace function public.tg_auditoria_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'AUDITORIA_INMUTABLE: el registro de auditoría no se puede modificar ni borrar';
end $$;

drop trigger if exists auditoria_sin_cambios on public.auditoria;
create trigger auditoria_sin_cambios before update or delete on public.auditoria
  for each row execute function public.tg_auditoria_inmutable();

alter table public.auditoria enable row level security;

-- Solo los administradores autenticados pueden leer. No hay política de
-- escritura: el backend inserta con la service key.
drop policy if exists auditoria_admin_lectura on public.auditoria;
create policy auditoria_admin_lectura on public.auditoria
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
