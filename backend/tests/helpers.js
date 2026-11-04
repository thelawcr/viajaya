'use strict';
const { MemoryRepository } = require('../src/repositories/memoryRepository');
const { crearReservaService } = require('../src/services/reservaService');
const { crearAdminService } = require('../src/services/adminService');

/** "Ahora" fijo para pruebas deterministas: 10-nov-2026 12:00 hora de Costa Rica. */
const AHORA = new Date('2026-11-10T12:00:00-06:00');

const DESTINO_ID = 'dest-1';

function crearEntorno({ capacidad = 10, precio = 100, ahora = AHORA } = {}) {
  const repo = new MemoryRepository({
    destinos: [
      { id: DESTINO_ID, nombre: 'Volcán Arenal', precioBase: precio, capacidadDiaria: capacidad, activo: true },
      { id: 'dest-off', nombre: 'Destino inactivo', precioBase: 50, capacidadDiaria: 5, activo: false },
    ],
  });
  let n = 0;
  const reservas = crearReservaService({
    repo,
    now: () => ahora,
    generarCodigo: () => `VY-TEST${String(++n).padStart(4, '0')}`,
  });
  const admin = crearAdminService({ repo, now: () => ahora });
  return { repo, reservas, admin };
}

/** Datos válidos para crear una reserva (se pueden sobreescribir campos). */
const datosReserva = (extra = {}) => ({
  destinoId: DESTINO_ID,
  fecha: '2026-11-20',
  personas: 2,
  nombreCliente: 'Cliente de Prueba',
  correoCliente: 'cliente@correo.com',
  telefonoCliente: '+506 8888-1234',
  numeroTarjeta: '4111111111111112', // termina en par => Aprobado
  ...extra,
});

module.exports = { AHORA, DESTINO_ID, crearEntorno, datosReserva };
