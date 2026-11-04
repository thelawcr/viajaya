'use strict';
/**
 * Pruebas unitarias de los Requerimientos Funcionales del módulo de clientes
 * RF-01 a RF-06.
 */
const { crearEntorno, datosReserva, DESTINO_ID } = require('./helpers');

const CORREO = 'cliente@correo.com';

describe('RF-01 Búsqueda de destinos', () => {
  test('RF-01.1 devuelve cupo disponible y cotización para destino, fecha y personas', async () => {
    const { reservas } = crearEntorno({ capacidad: 10, precio: 100 });
    await reservas.crearReserva(datosReserva({ personas: 4 }));
    const r = await reservas.buscarDisponibilidad({ destinoId: DESTINO_ID, fecha: '2026-11-20', personas: 3 });
    expect(r.cupoDisponible).toBe(6);
    expect(r.disponible).toBe(true);
    expect(r.cotizacion.total).toBe(339);
  });

  test('RF-01.2 indica no disponible cuando las personas superan el cupo', async () => {
    const { reservas } = crearEntorno({ capacidad: 5 });
    const r = await reservas.buscarDisponibilidad({ destinoId: DESTINO_ID, fecha: '2026-11-20', personas: 6 });
    expect(r.disponible).toBe(false);
  });

  test('RF-01.3 rechaza destinos inexistentes o inactivos, fechas pasadas y personas inválidas', async () => {
    const { reservas } = crearEntorno();
    await expect(reservas.buscarDisponibilidad({ destinoId: 'nope', fecha: '2026-11-20', personas: 2 })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(reservas.buscarDisponibilidad({ destinoId: 'dest-off', fecha: '2026-11-20', personas: 2 })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(reservas.buscarDisponibilidad({ destinoId: DESTINO_ID, fecha: '2026-11-01', personas: 2 })).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(reservas.buscarDisponibilidad({ destinoId: DESTINO_ID, fecha: '2026-11-20', personas: 0 })).rejects.toMatchObject({ code: 'VALIDACION' });
  });

  test('RF-01.4 solo lista destinos activos al turista', async () => {
    const { reservas } = crearEntorno();
    const lista = await reservas.listarDestinos();
    expect(lista.map((d) => d.id)).toEqual([DESTINO_ID]);
  });
});

describe('RF-02 Cotización', () => {
  test('RF-02.1 muestra el desglose subtotal, IVA y total antes de confirmar', async () => {
    const { reservas } = crearEntorno({ precio: 120 });
    const c = await reservas.cotizar({ destinoId: DESTINO_ID, personas: 5 });
    expect(c).toMatchObject({ subtotal: 600, iva: 78, total: 678, personas: 5 });
  });

  test('RF-02.2 la cotización no crea ninguna reserva', async () => {
    const { reservas, repo } = crearEntorno();
    await reservas.cotizar({ destinoId: DESTINO_ID, personas: 2 });
    expect(await repo.listReservas()).toHaveLength(0);
  });

  test('RF-02.3 rechaza una cantidad de personas inválida', async () => {
    const { reservas } = crearEntorno();
    await expect(reservas.cotizar({ destinoId: DESTINO_ID, personas: -1 })).rejects.toMatchObject({ code: 'VALIDACION' });
  });
});

describe('RF-03 Reserva y pago simulado', () => {
  test('RF-03.1 crea la reserva y genera un código único de confirmación', async () => {
    const { reservas } = crearEntorno();
    const a = await reservas.crearReserva(datosReserva());
    const b = await reservas.crearReserva(datosReserva());
    expect(a.codigo).toMatch(/^VY-/);
    expect(a.codigo).not.toBe(b.codigo);
    expect(a.estadoReserva).toBe('Pendiente');
  });

  test('RF-03.2 el código generado por defecto tiene formato VY-XXXXXXXX', () => {
    const { generarCodigoDefault } = require('../src/services/reservaService');
    expect(generarCodigoDefault()).toMatch(/^VY-[A-HJ-NP-Z2-9]{8}$/);
  });

  test('RF-03.3 valida los datos obligatorios del formulario', async () => {
    const { reservas } = crearEntorno();
    await expect(reservas.crearReserva(datosReserva({ nombreCliente: '  ' }))).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(reservas.crearReserva(datosReserva({ correoCliente: 'sin-arroba' }))).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(reservas.crearReserva(datosReserva({ fecha: '20/11/2026' }))).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(reservas.crearReserva(datosReserva({ numeroTarjeta: '12' }))).rejects.toMatchObject({ code: 'VALIDACION' });
  });

  test('RF-03.4 no permite reservar en un destino inactivo', async () => {
    const { reservas } = crearEntorno();
    await expect(reservas.crearReserva(datosReserva({ destinoId: 'dest-off' }))).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});

describe('RF-04 Consulta de reserva', () => {
  test('RF-04.1 encuentra la reserva activa con código y correo (sin distinguir mayúsculas)', async () => {
    const { reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva());
    const c = await reservas.consultarReserva({ codigo: r.codigo.toLowerCase(), correo: 'CLIENTE@correo.com' });
    expect(c.codigo).toBe(r.codigo);
    expect(c.destino).toBe('Volcán Arenal');
  });

  test('RF-04.2 un correo que no coincide no revela la reserva', async () => {
    const { reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva());
    await expect(reservas.consultarReserva({ codigo: r.codigo, correo: 'otro@correo.com' })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  test('RF-04.3 no devuelve reservas canceladas ni con fecha pasada', async () => {
    const { reservas, repo } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva());
    await reservas.cancelarReserva({ codigo: r.codigo, correo: CORREO });
    await expect(reservas.consultarReserva({ codigo: r.codigo, correo: CORREO })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });

    await repo.crearReservaAtomica({
      codigo: 'VY-PASADA01', destinoId: DESTINO_ID, fechaViaje: '2026-11-01', personas: 1,
      nombreCliente: 'X', correoCliente: CORREO, montoSubtotal: 100, montoIva: 13, montoTotal: 113,
      estadoReserva: 'Aprobada', estadoPago: 'Aprobado', tarjetaUltimos4: '0002',
    });
    await expect(reservas.consultarReserva({ codigo: 'VY-PASADA01', correo: CORREO })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});

describe('RF-05 Modificación de fecha', () => {
  test('RF-05.1 mueve la reserva a una nueva fecha con cupo y tiempo suficiente', async () => {
    const { reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva({ fecha: '2026-11-20' }));
    const m = await reservas.modificarFecha({ codigo: r.codigo, correo: CORREO, nuevaFecha: '2026-11-27' });
    expect(m.fechaViaje).toBe('2026-11-27');
  });

  test('RF-05.2 libera el cupo de la fecha anterior y ocupa el de la nueva', async () => {
    const { reservas, repo } = crearEntorno({ capacidad: 5 });
    const r = await reservas.crearReserva(datosReserva({ personas: 5, fecha: '2026-11-20' }));
    await reservas.modificarFecha({ codigo: r.codigo, correo: CORREO, nuevaFecha: '2026-11-27' });
    expect(await repo.personasReservadas(DESTINO_ID, '2026-11-20')).toBe(0);
    expect(await repo.personasReservadas(DESTINO_ID, '2026-11-27')).toBe(5);
  });

  test('RF-05.3 rechaza fecha en el pasado, misma fecha, formato inválido o correo incorrecto', async () => {
    const { reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva({ fecha: '2026-11-20' }));
    await expect(reservas.modificarFecha({ codigo: r.codigo, correo: CORREO, nuevaFecha: '2026-11-05' })).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(reservas.modificarFecha({ codigo: r.codigo, correo: CORREO, nuevaFecha: '2026-11-20' })).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(reservas.modificarFecha({ codigo: r.codigo, correo: CORREO, nuevaFecha: 'mañana' })).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(reservas.modificarFecha({ codigo: r.codigo, correo: 'otro@correo.com', nuevaFecha: '2026-11-27' })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});

describe('RF-06 Cancelación de reserva', () => {
  test('RF-06.1 cancela la reserva y libera el cupo', async () => {
    const { reservas, repo } = crearEntorno({ capacidad: 8 });
    const r = await reservas.crearReserva(datosReserva({ personas: 8 }));
    expect(await repo.personasReservadas(DESTINO_ID, '2026-11-20')).toBe(8);
    const c = await reservas.cancelarReserva({ codigo: r.codigo, correo: CORREO });
    expect(c.estadoReserva).toBe('Cancelada');
    expect(await repo.personasReservadas(DESTINO_ID, '2026-11-20')).toBe(0);
  });

  test('RF-06.2 no se puede cancelar dos veces la misma reserva', async () => {
    const { reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva());
    await reservas.cancelarReserva({ codigo: r.codigo, correo: CORREO });
    await expect(reservas.cancelarReserva({ codigo: r.codigo, correo: CORREO })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  test('RF-06.3 exige código y correo correctos', async () => {
    const { reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva());
    await expect(reservas.cancelarReserva({ codigo: r.codigo, correo: 'otro@correo.com' })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(reservas.cancelarReserva({ codigo: 'VY-NOEXISTE', correo: CORREO })).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});
