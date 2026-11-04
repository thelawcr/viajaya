'use strict';
/**
 * Reglas de negocio puras (sin acceso a base de datos). Son la única fuente de
 * verdad de RN-01 a RN-04 y se prueban de forma unitaria.
 */
const { cupoExcedido, fueraDeVentana, validacion } = require('./errors');

const IVA = 0.13;
const VENTANA_HORAS = 48;
/** Costa Rica no usa horario de verano: UTC-06:00 todo el año. */
const ZONA_HORARIA = '-06:00';

const ESTADOS_RESERVA = ['Pendiente', 'Aprobada', 'Cancelada'];
const ESTADOS_PAGO = ['Pendiente', 'Aprobado', 'Rechazado'];

const aCentavos = (monto) => Math.round(Number(monto) * 100);
const deCentavos = (c) => c / 100;

/**
 * RN-03: Monto Total = (Precio Base * N° de Personas) * 1.13.
 * Se calcula en centavos enteros para evitar errores de coma flotante.
 */
function calcularCotizacion(precioBase, personas) {
  if (!(Number(precioBase) > 0)) throw validacion('El precio base debe ser mayor que cero');
  if (!Number.isInteger(personas) || personas < 1) {
    throw validacion('La cantidad de personas debe ser un entero mayor o igual a 1');
  }
  const subtotalC = aCentavos(precioBase) * personas;
  const totalC = Math.round(subtotalC * (1 + IVA));
  return {
    precioBase: Number(precioBase),
    personas,
    subtotal: deCentavos(subtotalC),
    iva: deCentavos(totalC - subtotalC),
    total: deCentavos(totalC),
    tasaIva: IVA,
  };
}

/** Cupo disponible = capacidad máxima diaria − personas en reservas activas de la fecha. */
function cupoDisponible(capacidadDiaria, personasReservadas) {
  return Math.max(0, capacidadDiaria - personasReservadas);
}

/**
 * RN-01: no se puede registrar ni mover una reserva si la suma de personas
 * supera la capacidad máxima diaria del destino.
 */
function validarCupo(capacidadDiaria, personasReservadas, personasSolicitadas) {
  if (personasReservadas + personasSolicitadas > capacidadDiaria) {
    const libres = Math.max(capacidadDiaria - personasReservadas, 0);
    throw cupoExcedido(
      `No hay cupo suficiente para esa fecha: quedan ${libres} lugar${libres === 1 ? '' : 'es'} libre${libres === 1 ? '' : 's'}`
    );
  }
  return true;
}

/** Instante en que inicia la fecha de viaje (00:00 hora de Costa Rica). */
function inicioDeFecha(fechaISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO))) {
    throw validacion('La fecha debe tener el formato AAAA-MM-DD');
  }
  const d = new Date(`${fechaISO}T00:00:00${ZONA_HORARIA}`);
  if (Number.isNaN(d.getTime())) throw validacion('La fecha indicada no es válida');
  return d;
}

/** Horas que faltan desde `ahora` hasta el inicio de la fecha de viaje. */
function horasHastaViaje(fechaViaje, ahora) {
  return (inicioDeFecha(fechaViaje).getTime() - ahora.getTime()) / 3_600_000;
}

/** RN-02: solo se permite cambiar fecha o cancelar si faltan MÁS de 48 horas. */
function cumpleVentana(fechaViaje, ahora) {
  return horasHastaViaje(fechaViaje, ahora) > VENTANA_HORAS;
}

function validarVentana(fechaViaje, ahora) {
  if (!cumpleVentana(fechaViaje, ahora)) throw fueraDeVentana();
  return true;
}

/**
 * RN-04: gateway simulado. Si el número de tarjeta termina en dígito par el pago
 * es Aprobado; si termina en impar, Rechazado.
 */
function simularPago(numeroTarjeta) {
  const limpio = String(numeroTarjeta ?? '').replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(limpio)) {
    throw validacion('El número de tarjeta debe contener entre 12 y 19 dígitos');
  }
  const ultimo = Number(limpio[limpio.length - 1]);
  return {
    estadoPago: ultimo % 2 === 0 ? 'Aprobado' : 'Rechazado',
    ultimos4: limpio.slice(-4),
  };
}

/** Reserva activa: no cancelada ni eliminada y con fecha de viaje no pasada. */
function esReservaActiva(reserva, ahora) {
  if (!reserva || reserva.estadoReserva === 'Cancelada') return false;
  const hoy = new Date(ahora.getTime() + -6 * 3_600_000).toISOString().slice(0, 10);
  return reserva.fechaViaje >= hoy;
}

/** Fecha de hoy (AAAA-MM-DD) en hora de Costa Rica. */
function hoyISO(ahora) {
  return new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

module.exports = {
  IVA,
  VENTANA_HORAS,
  ESTADOS_RESERVA,
  ESTADOS_PAGO,
  calcularCotizacion,
  cupoDisponible,
  validarCupo,
  horasHastaViaje,
  cumpleVentana,
  validarVentana,
  simularPago,
  esReservaActiva,
  hoyISO,
  inicioDeFecha,
};
