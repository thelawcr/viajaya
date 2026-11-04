'use strict';

const rules = require('../domain/rules');
const v = require('../domain/validators');
const { validacion, noEncontrado } = require('../domain/errors');

function crearAdminService({ repo }) {
  async function reservaOError(id) {
    const r = await repo.getReserva(String(id));
    if (!r) throw noEncontrado('Reserva no encontrada');
    return r;
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

  return {
    // ---------- RF-07: CRUD de destinos ----------
    async listarDestinos() {
      return repo.listDestinos({ soloActivos: false });
    },

    async crearDestino(datos) {
      return repo.createDestino(validarDestino(datos));
    },

    async editarDestino(id, datos) {
      const existente = await repo.getDestino(String(id));
      if (!existente) throw noEncontrado('Destino no encontrado');
      return repo.updateDestino(existente.id, validarDestino(datos, { parcial: true }));
    },

    /** Desactiva (no borra) para conservar el historial de reservas. */
    async desactivarDestino(id) {
      const existente = await repo.getDestino(String(id));
      if (!existente) throw noEncontrado('Destino no encontrado');
      return repo.updateDestino(existente.id, { activo: false });
    },

    async activarDestino(id) {
      const existente = await repo.getDestino(String(id));
      if (!existente) throw noEncontrado('Destino no encontrado');
      return repo.updateDestino(existente.id, { activo: true });
    },

    // ---------- RF-08: gestión de reservas ----------
    async listarReservas() {
      return repo.listReservas();
    },

    async aprobarReserva(id) {
      const r = await reservaOError(id);
      if (r.estadoReserva === 'Cancelada') throw validacion('No se puede aprobar una reserva cancelada');
      return repo.updateReserva(r.id, { estadoReserva: 'Aprobada' });
    },

    async cancelarReserva(id) {
      const r = await reservaOError(id);
      return repo.updateReserva(r.id, { estadoReserva: 'Cancelada' });
    },

    async eliminarReserva(id) {
      const r = await reservaOError(id);
      await repo.deleteReserva(r.id);
      return { eliminada: true, codigo: r.codigo };
    },

    // ---------- RF-09: simulación de cobro ----------
    async cambiarEstadoPago(id, estadoPago) {
      if (!rules.ESTADOS_PAGO.includes(estadoPago)) {
        throw validacion(`El estado de pago debe ser uno de: ${rules.ESTADOS_PAGO.join(', ')}`);
      }
      const r = await reservaOError(id);
      return repo.updateReserva(r.id, { estadoPago });
    },
  };
}

module.exports = { crearAdminService };
