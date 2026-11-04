-- =====================================================================
-- ViajaYa - Migración final del Entregable 3
-- Ejecutar UNA vez en Supabase > SQL Editor si ya había creado las tablas
-- con una versión anterior de schema.sql. Es seguro repetirla.
-- Agrega: teléfono del cliente (CU-02) y reactivación de reservas con
-- control de cupo (CU-05, RN-01).
-- =====================================================================

alter table public.reservas add column if not exists telefono_cliente text not null default '';

-- Nueva firma de crear_reserva_atomica (con p_telefono): se elimina la anterior
drop function if exists public.crear_reserva_atomica(uuid,date,integer,text,text,text,numeric,numeric,numeric,text,text);

create or replace function public.crear_reserva_atomica(
  p_destino uuid, p_fecha date, p_personas integer, p_codigo text,
  p_nombre text, p_correo text, p_telefono text, p_subtotal numeric, p_iva numeric,
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
    (codigo, destino_id, fecha_viaje, personas, nombre_cliente, correo_cliente, telefono_cliente,
     monto_subtotal, monto_iva, monto_total, estado_pago, tarjeta_ultimos4)
  values
    (p_codigo, p_destino, p_fecha, p_personas, p_nombre, lower(p_correo), p_telefono,
     p_subtotal, p_iva, p_total, p_estado_pago, p_ultimos4)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.reactivar_reserva_atomica(p_reserva uuid)
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
   where destino_id = v_res.destino_id and fecha_viaje = v_res.fecha_viaje
     and estado_reserva <> 'Cancelada' and id <> p_reserva;

  if v_ocup + v_res.personas > v_cap then raise exception 'CUPO_EXCEDIDO'; end if;

  update public.reservas set estado_reserva = 'Aprobada' where id = p_reserva returning * into v_res;
  return v_res;
end $$;

revoke all on function public.crear_reserva_atomica(uuid,date,integer,text,text,text,text,numeric,numeric,numeric,text,text) from public, anon, authenticated;
grant execute on function public.crear_reserva_atomica(uuid,date,integer,text,text,text,text,numeric,numeric,numeric,text,text) to service_role;
revoke all on function public.reactivar_reserva_atomica(uuid) from public, anon, authenticated;
grant execute on function public.reactivar_reserva_atomica(uuid) to service_role;
