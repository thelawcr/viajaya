'use strict';
/**
 * Servicio de reservas para turistas (RF-01 a RF-06).
 * Orquesta las reglas puras de domain/rules.js con el repositorio.
 */
const { randomBytes } = require('crypto');
const rules = require('../domain/rules');
const v = require('../domain/validators');
const { validacion, noEncontrado } = require('../domain/errors');
const { crearAuditor } = require('./auditoria');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I)

function generarCodigoDefault() {
  const bytes = randomBytes(8);
  let s = '';
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return `VY-${s}`;
}

/** Vista pública de una reserva (sin ids internos ni datos de pago sensibles). */
function vistaReserva(r, destinoNombre) {
  return {
    codigo: r.codigo,
    destino: destinoNombre ?? r.destinoNombre,
    fechaViaje: r.fechaViaje,
    personas: r.personas,
    nombreCliente: r.nombreCliente,
    correoCliente: r.correoCliente,
    telefonoCliente: r.telefonoCliente,
    subtotal: r.montoSubtotal,
    iva: r.montoIva,
    total: r.montoTotal,
    estadoReserva: r.estadoReserva,
    estadoPago: r.estadoPago,
    tarjetaUltimos4: r.tarjetaUltimos4,
  };
}

function crearReservaService({ repo, now = () => new Date(), generarCodigo = generarCodigoDefault }) {
  const auditar = crearAuditor(repo);
  async function destinoDisponible(destinoId) {
    const destino = await repo.getDestino(String(destinoId ?? ''));
    if (!destino || !destino.activo) throw noEncontrado('El destino no existe o no está disponible');
    return destino;
  }

  function fechaFutura(fecha, campo = 'fecha del viaje') {
    rules.inicioDeFecha(fecha); // valida formato
    if (fecha < rules.hoyISO(now())) throw validacion(`La ${campo} no puede estar en el pasado`);
  }

  /** Carga una reserva activa verificando código + correo (RF-04, RF-05, RF-06). */
  async function cargarReservaActiva(codigo, correoCliente) {
    const cod = v.codigoReserva(codigo);
    const mail = v.correo(correoCliente);
    const reserva = await repo.getReservaPorCodigo(cod);
    if (
      !reserva ||
      reserva.correoCliente.toLowerCase() !== mail ||
      !rules.esReservaActiva(reserva, now())
    ) {
      throw noEncontrado('No se encontró una reserva activa con ese código y correo');
    }
    return reserva;
  }

  return {
    /** Destinos activos que ve el turista. */
    async listarDestinos() {
      return repo.listDestinos({ soloActivos: true });
    },

    /** RF-01: búsqueda de destino, fecha y cantidad de personas con cupo y cotización. */
    async buscarDisponibilidad({ destinoId, fecha, personas }) {
      const destino = await destinoDisponible(destinoId);
      const n = v.entero(personas, 'personas', { max: v.MAX_PERSONAS_POR_RESERVA });
      fechaFutura(fecha);
      const ocupadas = await repo.personasReservadas(destino.id, fecha);
      const cupo = rules.cupoDisponible(destino.capacidadDiaria, ocupadas);
      return {
        destino,
        fecha,
        personas: n,
        cupoDisponible: cupo,
        disponible: n <= cupo,
        cotizacion: rules.calcularCotizacion(destino.precioBase, n),
      };
    },

    /** RF-02: desglose automático del costo total antes de confirmar. */
    async cotizar({ destinoId, personas }) {
      const destino = await destinoDisponible(destinoId);
      const n = v.entero(personas, 'personas', { max: v.MAX_PERSONAS_POR_RESERVA });
      return { destino: destino.nombre, ...rules.calcularCotizacion(destino.precioBase, n) };
    },

    /** RF-03: crea la reserva con pago simulado y genera el código único. */
    async crearReserva(datos) {
      const destino = await destinoDisponible(datos.destinoId);
      const personas = v.entero(datos.personas, 'personas', { max: v.MAX_PERSONAS_POR_RESERVA });
      const nombreCliente = v.texto(datos.nombreCliente, 'nombre');
      const correoCliente = v.correo(datos.correoCliente);
      const telefonoCliente = v.telefono(datos.telefonoCliente);
      fechaFutura(datos.fecha);

      const cotizacion = rules.calcularCotizacion(destino.precioBase, personas);
      const pago = rules.simularPago(datos.numeroTarjeta); // RN-04

      // RN-01 (verificación previa; el repositorio la repite de forma atómica)
      const ocupadas = await repo.personasReservadas(destino.id, datos.fecha);
      rules.validarCupo(destino.capacidadDiaria, ocupadas, personas);

      let codigo = generarCodigo();
      for (let i = 0; i < 5 && (await repo.getReservaPorCodigo(codigo)); i++) codigo = generarCodigo();

      const reserva = await repo.crearReservaAtomica({
        codigo,
        destinoId: destino.id,
        fechaViaje: datos.fecha,
        personas,
        nombreCliente,
        correoCliente,
        telefonoCliente,
        montoSubtotal: cotizacion.subtotal,
        montoIva: cotizacion.iva,
        montoTotal: cotizacion.total,
        estadoReserva: 'Pendiente',
        estadoPago: pago.estadoPago,
        tarjetaUltimos4: pago.ultimos4,
      });
      await auditar({
        actor: `cliente:${correoCliente}`,
        accion: 'RESERVA_CREADA',
        entidad: 'reserva',
        entidadId: reserva.id,
        detalle: {
          codigo: reserva.codigo,
          destino: destino.nombre,
          fechaViaje: reserva.fechaViaje,
          personas,
          total: reserva.montoTotal,
          estadoPago: reserva.estadoPago,
        },
      });
      return vistaReserva(reserva, destino.nombre);
    },

    /** RF-04: consulta una reserva activa con código y correo. */
    async consultarReserva({ codigo, correo }) {
      const reserva = await cargarReservaActiva(codigo, correo);
      const destino = await repo.getDestino(reserva.destinoId);
      return vistaReserva(reserva, destino?.nombre);
    },

    /** RF-05: mueve la fecha (sujeto a RN-02 y RN-01). */
    async modificarFecha({ codigo, correo, nuevaFecha }) {
      const reserva = await cargarReservaActiva(codigo, correo);
      rules.validarVentana(reserva.fechaViaje, now()); // RN-02
      fechaFutura(nuevaFecha, 'nueva fecha');
      if (nuevaFecha === reserva.fechaViaje) throw validacion('La nueva fecha debe ser distinta de la actual');

      const destino = await repo.getDestino(reserva.destinoId);
      const ocupadas = await repo.personasReservadas(reserva.destinoId, nuevaFecha, reserva.id);
      rules.validarCupo(destino.capacidadDiaria, ocupadas, reserva.personas); // RN-01

      const actualizada = await repo.moverReservaAtomica(reserva.id, nuevaFecha);
      await auditar({
        actor: `cliente:${reserva.correoCliente}`,
        accion: 'RESERVA_FECHA_CAMBIADA',
        entidad: 'reserva',
        entidadId: reserva.id,
        detalle: { codigo: reserva.codigo, de: reserva.fechaViaje, a: nuevaFecha },
      });
      return vistaReserva(actualizada, destino.nombre);
    },

    /** RF-06: cancela la reserva y libera el cupo (sujeto a RN-02). */
    async cancelarReserva({ codigo, correo }) {
      const reserva = await cargarReservaActiva(codigo, correo);
      rules.validarVentana(reserva.fechaViaje, now()); // RN-02
      const actualizada = await repo.updateReserva(reserva.id, { estadoReserva: 'Cancelada' });
      await auditar({
        actor: `cliente:${reserva.correoCliente}`,
        accion: 'RESERVA_CANCELADA_CLIENTE',
        entidad: 'reserva',
        entidadId: reserva.id,
        detalle: { codigo: reserva.codigo, fechaViaje: reserva.fechaViaje, personas: reserva.personas },
      });
      const destino = await repo.getDestino(reserva.destinoId);
      return vistaReserva(actualizada, destino?.nombre);
    },
  };
}

module.exports = { crearReservaService, generarCodigoDefault, vistaReserva };
