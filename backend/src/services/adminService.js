'use strict';
/**
 * Servicio del módulo de administración (RF-07, RF-08, RF-09).
 * Decisión de diseño (resuelve el Supuesto 5 de la Visión): las acciones del
 * administrador NO están sujetas a la ventana de 48 horas de RN-02, que aplica
 * solo a cambios iniciados por el cliente.
 *
 * Cada operación que modifica datos recibe el `actor` (correo del administrador
 * autenticado) y deja una entrada en el registro de auditoría.
 */
const rules = require('../domain/rules');
const v = require('../domain/validators');
const { validacion, noEncontrado } = require('../domain/errors');
const { crearAuditor } = require('./auditoria');

function crearAdminService({ repo }) {
  const auditar = crearAuditor(repo);

  async function reservaOError(id) {
    const r = await repo.getReserva(String(id));
    if (!r) throw noEncontrado('Reserva no encontrada');
    return r;
  }

  async function destinoOError(id) {
    const d = await repo.getDestino(String(id));
    if (!d) throw noEncontrado('Destino no encontrado');
    return d;
  }

  function validarDestino(d, { parcial = false } = {}) {
    const out = {};
    if (!parcial || d.nombre !== undefined) out.nombre = v.texto(d.nombre, 'nombre');
    if (d.descripcion !== undefined) {
      const desc = String(d.descripcion ?? '').trim();
      if (desc.length > 500) throw validacion('La descripción no puede superar 500 caracteres');
      out.descripcion = desc;
    }
    if (!parcial || d.precioBase !== undefined) out.precioBase = v.monto(d.precioBase, 'precio base');
    if (!parcial || d.capacidadDiaria !== undefined) {
      out.capacidadDiaria = v.entero(d.capacidadDiaria, 'capacidad máxima diaria', { max: 10000 });
    }
    return out;
  }

  /** Datos mínimos de una reserva para el detalle de auditoría (sobreviven a su eliminación). */
  const resumenReserva = (r) => ({
    codigo: r.codigo,
    fechaViaje: r.fechaViaje,
    personas: r.personas,
    cliente: r.correoCliente,
  });

  return {
    // ---------- RF-07: CRUD de destinos ----------
    async listarDestinos() {
      return repo.listDestinos({ soloActivos: false });
    },

    async crearDestino(datos, actor) {
      const d = await repo.createDestino(validarDestino(datos));
      await auditar({
        actor,
        accion: 'DESTINO_CREADO',
        entidad: 'destino',
        entidadId: d.id,
        detalle: { nombre: d.nombre, precioBase: d.precioBase, capacidadDiaria: d.capacidadDiaria },
      });
      return d;
    },

    async editarDestino(id, datos, actor) {
      const antes = await destinoOError(id);
      const cambios = validarDestino(datos, { parcial: true });
      const d = await repo.updateDestino(antes.id, cambios);
      const detalle = { nombre: d.nombre, cambios: {} };
      for (const k of Object.keys(cambios)) detalle.cambios[k] = { de: antes[k], a: cambios[k] };
      await auditar({ actor, accion: 'DESTINO_EDITADO', entidad: 'destino', entidadId: d.id, detalle });
      return d;
    },

    /** Desactiva (no borra) para conservar el historial de reservas. */
    async desactivarDestino(id, actor) {
      const existente = await destinoOError(id);
      const d = await repo.updateDestino(existente.id, { activo: false });
      await auditar({ actor, accion: 'DESTINO_DESACTIVADO', entidad: 'destino', entidadId: d.id, detalle: { nombre: d.nombre } });
      return d;
    },

    async activarDestino(id, actor) {
      const existente = await destinoOError(id);
      const d = await repo.updateDestino(existente.id, { activo: true });
      await auditar({ actor, accion: 'DESTINO_ACTIVADO', entidad: 'destino', entidadId: d.id, detalle: { nombre: d.nombre } });
      return d;
    },

    // ---------- RF-08: gestión de reservas ----------
    async listarReservas() {
      return repo.listReservas();
    },

    async aprobarReserva(id, actor) {
      const r = await reservaOError(id);
      if (r.estadoReserva === 'Cancelada') throw validacion('No se puede aprobar una reserva cancelada');
      const nueva = await repo.updateReserva(r.id, { estadoReserva: 'Aprobada' });
      await auditar({
        actor,
        accion: 'RESERVA_APROBADA',
        entidad: 'reserva',
        entidadId: r.id,
        detalle: { ...resumenReserva(r), estadoAnterior: r.estadoReserva },
      });
      return nueva;
    },

    async cancelarReserva(id, actor) {
      const r = await reservaOError(id);
      const nueva = await repo.updateReserva(r.id, { estadoReserva: 'Cancelada' });
      await auditar({
        actor,
        accion: 'RESERVA_CANCELADA_ADMIN',
        entidad: 'reserva',
        entidadId: r.id,
        detalle: { ...resumenReserva(r), estadoAnterior: r.estadoReserva },
      });
      return nueva;
    },

    async eliminarReserva(id, actor) {
      const r = await reservaOError(id);
      await repo.deleteReserva(r.id);
      await auditar({
        actor,
        accion: 'RESERVA_ELIMINADA',
        entidad: 'reserva',
        entidadId: r.id,
        detalle: { ...resumenReserva(r), estadoReserva: r.estadoReserva, estadoPago: r.estadoPago, total: r.montoTotal },
      });
      return { eliminada: true, codigo: r.codigo };
    },

    // ---------- RF-09: simulación de cobro ----------
    async cambiarEstadoPago(id, estadoPago, actor) {
      if (!rules.ESTADOS_PAGO.includes(estadoPago)) {
        throw validacion(`El estado de pago debe ser uno de: ${rules.ESTADOS_PAGO.join(', ')}`);
      }
      const r = await reservaOError(id);
      const nueva = await repo.updateReserva(r.id, { estadoPago });
      await auditar({
        actor,
        accion: 'PAGO_MODIFICADO',
        entidad: 'reserva',
        entidadId: r.id,
        detalle: { ...resumenReserva(r), de: r.estadoPago, a: estadoPago },
      });
      return nueva;
    },

    // ---------- Trazabilidad ----------
    /** Entradas de auditoría, de la más reciente a la más antigua. */
    async listarAuditoria({ limite } = {}) {
      const n = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 500) : 200;
      return repo.listAuditoria({ limite: n });
    },
  };
}

module.exports = { crearAdminService };
