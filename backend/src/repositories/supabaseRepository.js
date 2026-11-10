'use strict';
/**
 * Repositorio sobre PostgreSQL (Supabase). El backend usa la service key, por lo
 * que las políticas RLS protegen el acceso directo desde el navegador con la
 * anon key, mientras que las reglas de negocio las aplica este servidor.
 * Las operaciones críticas de cupo (RN-01) se ejecutan en funciones SQL que
 * bloquean la fila del destino para evitar sobrecupos por concurrencia.
 */
const { cupoExcedido, noEncontrado, validacion, AppError } = require('../domain/errors');

const aDestino = (r) =>
  r && {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion || '',
    precioBase: Number(r.precio_base),
    capacidadDiaria: r.capacidad_diaria,
    activo: r.activo,
  };

const aReserva = (r) =>
  r && {
    id: r.id,
    codigo: r.codigo,
    destinoId: r.destino_id,
    destinoNombre: r.destinos?.nombre,
    fechaViaje: r.fecha_viaje,
    personas: r.personas,
    nombreCliente: r.nombre_cliente,
    correoCliente: r.correo_cliente,
    telefonoCliente: r.telefono_cliente || '',
    montoSubtotal: Number(r.monto_subtotal),
    montoIva: Number(r.monto_iva),
    montoTotal: Number(r.monto_total),
    estadoReserva: r.estado_reserva,
    estadoPago: r.estado_pago,
    tarjetaUltimos4: r.tarjeta_ultimos4,
    createdAt: r.created_at,
  };

function traducirError(error) {
  const msg = error?.message || '';
  if (msg.includes('CUPO_EXCEDIDO')) return cupoExcedido();
  if (msg.includes('DESTINO_NO_DISPONIBLE')) return validacion('El destino no existe o no está disponible');
  if (msg.includes('RESERVA_NO_ENCONTRADA')) return noEncontrado('Reserva no encontrada');
  return new AppError('ERROR_BD', `Error de base de datos: ${msg}`, 500);
}

class SupabaseRepository {
  constructor(client) {
    this.db = client;
  }

  async _ok({ data, error }) {
    if (error) throw traducirError(error);
    return data;
  }

  // ---------- Destinos ----------
  async listDestinos({ soloActivos = false } = {}) {
    let q = this.db.from('destinos').select('*').order('nombre');
    if (soloActivos) q = q.eq('activo', true);
    return (await this._ok(await q)).map(aDestino);
  }

  async getDestino(id) {
    const data = await this._ok(await this.db.from('destinos').select('*').eq('id', id).maybeSingle());
    return aDestino(data) || null;
  }

  async createDestino(d) {
    const data = await this._ok(
      await this.db
        .from('destinos')
        .insert({
          nombre: d.nombre,
          descripcion: d.descripcion || '',
          precio_base: d.precioBase,
          capacidad_diaria: d.capacidadDiaria,
        })
        .select()
        .single()
    );
    return aDestino(data);
  }

  async updateDestino(id, patch) {
    const fila = {};
    if (patch.nombre !== undefined) fila.nombre = patch.nombre;
    if (patch.descripcion !== undefined) fila.descripcion = patch.descripcion;
    if (patch.precioBase !== undefined) fila.precio_base = patch.precioBase;
    if (patch.capacidadDiaria !== undefined) fila.capacidad_diaria = patch.capacidadDiaria;
    if (patch.activo !== undefined) fila.activo = patch.activo;
    const data = await this._ok(
      await this.db.from('destinos').update(fila).eq('id', id).select().maybeSingle()
    );
    if (!data) throw noEncontrado('Destino no encontrado');
    return aDestino(data);
  }

  // ---------- Reservas ----------
  async personasReservadas(destinoId, fecha, excluirReservaId = null) {
    let q = this.db
      .from('reservas')
      .select('personas')
      .eq('destino_id', destinoId)
      .eq('fecha_viaje', fecha)
      .neq('estado_reserva', 'Cancelada');
    if (excluirReservaId) q = q.neq('id', excluirReservaId);
    const filas = await this._ok(await q);
    return filas.reduce((s, f) => s + f.personas, 0);
  }

  async crearReservaAtomica(d) {
    const data = await this._ok(
      await this.db.rpc('crear_reserva_atomica', {
        p_destino: d.destinoId,
        p_fecha: d.fechaViaje,
        p_personas: d.personas,
        p_codigo: d.codigo,
        p_nombre: d.nombreCliente,
        p_correo: d.correoCliente,
        p_telefono: d.telefonoCliente,
        p_subtotal: d.montoSubtotal,
        p_iva: d.montoIva,
        p_total: d.montoTotal,
        p_estado_pago: d.estadoPago,
        p_ultimos4: d.tarjetaUltimos4,
      })
    );
    return aReserva(data);
  }

  async moverReservaAtomica(id, nuevaFecha) {
    const data = await this._ok(
      await this.db.rpc('mover_reserva_atomica', { p_reserva: id, p_nueva_fecha: nuevaFecha })
    );
    return aReserva(data);
  }

  async reactivarReservaAtomica(id) {
    const data = await this._ok(await this.db.rpc('reactivar_reserva_atomica', { p_reserva: id }));
    return aReserva(data);
  }

  async getReserva(id) {
    const data = await this._ok(
      await this.db.from('reservas').select('*, destinos(nombre)').eq('id', id).maybeSingle()
    );
    return aReserva(data) || null;
  }

  async getReservaPorCodigo(codigo) {
    const data = await this._ok(
      await this.db.from('reservas').select('*, destinos(nombre)').eq('codigo', codigo).maybeSingle()
    );
    return aReserva(data) || null;
  }

  async listReservas() {
    const data = await this._ok(
      await this.db
        .from('reservas')
        .select('*, destinos(nombre)')
        .order('created_at', { ascending: false }) // más recientes primero
    );
    return data.map(aReserva);
  }

  async updateReserva(id, patch) {
    const fila = {};
    if (patch.estadoReserva !== undefined) fila.estado_reserva = patch.estadoReserva;
    if (patch.estadoPago !== undefined) fila.estado_pago = patch.estadoPago;
    const data = await this._ok(
      await this.db.from('reservas').update(fila).eq('id', id).select('*, destinos(nombre)').maybeSingle()
    );
    if (!data) throw noEncontrado('Reserva no encontrada');
    return aReserva(data);
  }

  async deleteReserva(id) {
    const data = await this._ok(await this.db.from('reservas').delete().eq('id', id).select('id'));
    if (!data.length) throw noEncontrado('Reserva no encontrada');
  }

  // ---------- Auditoría ----------
  async registrarAuditoria({ actor, accion, entidad, entidadId = null, detalle = {} }) {
    await this._ok(
      await this.db.from('auditoria').insert({
        actor,
        accion,
        entidad,
        entidad_id: entidadId,
        detalle,
      })
    );
  }

  async listAuditoria({ limite = 200 } = {}) {
    const data = await this._ok(
      await this.db.from('auditoria').select('*').order('created_at', { ascending: false }).limit(limite)
    );
    return data.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      actor: r.actor,
      accion: r.accion,
      entidad: r.entidad,
      entidadId: r.entidad_id,
      detalle: r.detalle || {},
    }));
  }
}

module.exports = { SupabaseRepository };
