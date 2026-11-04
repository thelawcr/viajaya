'use strict';
/**
 * Repositorio en memoria. Se usa en las pruebas unitarias y en el modo
 * demostración (sin Supabase). Implementa el mismo contrato que
 * supabaseRepository.js.
 */
const { randomUUID } = require('crypto');
const { validarCupo } = require('../domain/rules');
const { noEncontrado, validacion } = require('../domain/errors');

const clonar = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);

class MemoryRepository {
  constructor({ destinos = [], reservas = [] } = {}) {
    this.destinos = destinos.map((d) => ({ activo: true, descripcion: '', ...d, id: d.id || randomUUID() }));
    this.reservas = reservas.map((r) => ({ ...r, id: r.id || randomUUID() }));
    this.auditoria = [];
  }

  // ---------- Auditoría (solo se agrega, nunca se modifica ni se borra) ----------
  async registrarAuditoria({ actor, accion, entidad, entidadId = null, detalle = {} }) {
    this.auditoria.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      actor,
      accion,
      entidad,
      entidadId,
      detalle: clonar(detalle),
    });
  }

  async listAuditoria({ limite = 200 } = {}) {
    return clonar([...this.auditoria].reverse().slice(0, limite));
  }

  // ---------- Destinos ----------
  async listDestinos({ soloActivos = false } = {}) {
    return clonar(this.destinos.filter((d) => !soloActivos || d.activo));
  }

  async getDestino(id) {
    return clonar(this.destinos.find((d) => d.id === id)) || null;
  }

  async createDestino(datos) {
    const destino = { id: randomUUID(), activo: true, descripcion: '', ...datos };
    this.destinos.push(destino);
    return clonar(destino);
  }

  async updateDestino(id, patch) {
    const d = this.destinos.find((x) => x.id === id);
    if (!d) throw noEncontrado('Destino no encontrado');
    Object.assign(d, patch);
    return clonar(d);
  }

  // ---------- Reservas ----------
  async personasReservadas(destinoId, fecha, excluirReservaId = null) {
    return this._ocupadas(destinoId, fecha, excluirReservaId);
  }

  /** Versión síncrona: permite verificar e insertar sin ceder el control (atomicidad). */
  _ocupadas(destinoId, fecha, excluirReservaId = null) {
    return this.reservas
      .filter(
        (r) =>
          r.destinoId === destinoId &&
          r.fechaViaje === fecha &&
          r.estadoReserva !== 'Cancelada' &&
          r.id !== excluirReservaId
      )
      .reduce((suma, r) => suma + r.personas, 0);
  }

  /** Inserta verificando el cupo en la misma operación (en memoria es atómico). */
  async crearReservaAtomica(datos) {
    const destino = this.destinos.find((d) => d.id === datos.destinoId && d.activo);
    if (!destino) throw validacion('El destino no existe o no está disponible');
    const ocupadas = this._ocupadas(datos.destinoId, datos.fechaViaje);
    validarCupo(destino.capacidadDiaria, ocupadas, datos.personas);
    const reserva = { id: randomUUID(), createdAt: new Date().toISOString(), ...datos };
    this.reservas.push(reserva);
    return clonar(reserva);
  }

  async moverReservaAtomica(id, nuevaFecha) {
    const r = this.reservas.find((x) => x.id === id);
    if (!r) throw noEncontrado('Reserva no encontrada');
    const destino = this.destinos.find((d) => d.id === r.destinoId);
    const ocupadas = this._ocupadas(r.destinoId, nuevaFecha, id);
    validarCupo(destino.capacidadDiaria, ocupadas, r.personas);
    r.fechaViaje = nuevaFecha;
    return clonar(r);
  }

  async getReserva(id) {
    return clonar(this.reservas.find((r) => r.id === id)) || null;
  }

  async getReservaPorCodigo(codigo) {
    return clonar(this.reservas.find((r) => r.codigo === codigo)) || null;
  }

  async listReservas() {
    return clonar(
      [...this.reservas]
        .sort((a, b) => (a.fechaViaje < b.fechaViaje ? 1 : -1))
        .map((r) => ({ ...r, destinoNombre: this.destinos.find((d) => d.id === r.destinoId)?.nombre }))
    );
  }

  async updateReserva(id, patch) {
    const r = this.reservas.find((x) => x.id === id);
    if (!r) throw noEncontrado('Reserva no encontrada');
    Object.assign(r, patch);
    return clonar(r);
  }

  async deleteReserva(id) {
    const i = this.reservas.findIndex((r) => r.id === id);
    if (i === -1) throw noEncontrado('Reserva no encontrada');
    this.reservas.splice(i, 1);
  }
}

module.exports = { MemoryRepository };
