'use strict';
/**
 * Pruebas unitarias de las Reglas de Negocio RN-01 a RN-04.
 */
const rules = require('../src/domain/rules');
const { crearEntorno, datosReserva, DESTINO_ID } = require('./helpers');

describe('RN-01 Control de cupo estricto', () => {
  test('RN-01.1 permite reservar cuando la suma de personas es exactamente la capacidad', async () => {
    const { reservas } = crearEntorno({ capacidad: 10 });
    const r = await reservas.crearReserva(datosReserva({ personas: 10 }));
    expect(r.personas).toBe(10);
  });

  test('RN-01.2 rechaza una reserva que supera la capacidad por una sola persona', async () => {
    const { reservas } = crearEntorno({ capacidad: 10 });
    await expect(reservas.crearReserva(datosReserva({ personas: 11 }))).rejects.toMatchObject({
      code: 'CUPO_EXCEDIDO',
    });
  });

  test('RN-01.3 suma las reservas existentes de la misma fecha antes de aceptar una nueva', async () => {
    const { reservas } = crearEntorno({ capacidad: 10 });
    await reservas.crearReserva(datosReserva({ personas: 6 }));
    await expect(reservas.crearReserva(datosReserva({ personas: 5 }))).rejects.toMatchObject({
      code: 'CUPO_EXCEDIDO',
    });
    await expect(reservas.crearReserva(datosReserva({ personas: 4 }))).resolves.toBeDefined();
  });

  test('RN-01.4 el cupo es por fecha: otra fecha tiene su propia capacidad', async () => {
    const { reservas } = crearEntorno({ capacidad: 5 });
    await reservas.crearReserva(datosReserva({ personas: 5, fecha: '2026-11-20' }));
    await expect(
      reservas.crearReserva(datosReserva({ personas: 5, fecha: '2026-11-21' }))
    ).resolves.toBeDefined();
  });

  test('RN-01.5 una reserva cancelada libera el cupo', async () => {
    const { reservas } = crearEntorno({ capacidad: 5 });
    const r = await reservas.crearReserva(datosReserva({ personas: 5 }));
    await reservas.cancelarReserva({ codigo: r.codigo, correo: 'cliente@correo.com' });
    await expect(reservas.crearReserva(datosReserva({ personas: 5 }))).resolves.toBeDefined();
  });

  test('RN-01.6 mover una reserva a una fecha sin cupo se rechaza y conserva la fecha original', async () => {
    const { reservas } = crearEntorno({ capacidad: 5 });
    await reservas.crearReserva(datosReserva({ personas: 5, fecha: '2026-11-25', correoCliente: 'otro@correo.com' }));
    const r = await reservas.crearReserva(datosReserva({ personas: 2, fecha: '2026-11-20' }));
    await expect(
      reservas.modificarFecha({ codigo: r.codigo, correo: 'cliente@correo.com', nuevaFecha: '2026-11-25' })
    ).rejects.toMatchObject({ code: 'CUPO_EXCEDIDO' });
    const consulta = await reservas.consultarReserva({ codigo: r.codigo, correo: 'cliente@correo.com' });
    expect(consulta.fechaViaje).toBe('2026-11-20');
  });

  test('RN-01.7 solicitudes simultáneas no generan sobrecupo', async () => {
    const { reservas, repo } = crearEntorno({ capacidad: 10 });
    const intentos = Array.from({ length: 5 }, () => reservas.crearReserva(datosReserva({ personas: 4 })));
    const resultados = await Promise.allSettled(intentos);
    expect(resultados.filter((x) => x.status === 'fulfilled')).toHaveLength(2);
    expect(await repo.personasReservadas(DESTINO_ID, '2026-11-20')).toBeLessThanOrEqual(10);
  });

  test('RN-01.8 validarCupo (función pura) acepta el límite y rechaza el exceso', () => {
    expect(rules.validarCupo(10, 6, 4)).toBe(true);
    expect(() => rules.validarCupo(10, 6, 5)).toThrow();
    expect(rules.cupoDisponible(10, 12)).toBe(0);
  });
});

describe('RN-02 Ventana temporal de 48 horas', () => {
  // Fecha de viaje: 13-nov-2026 00:00 (hora de Costa Rica)
  const viaje = '2026-11-13';

  test('RN-02.1 con más de 48 horas de anticipación se permite', () => {
    const ahora = new Date('2026-11-10T23:59:00-06:00'); // 48 h y 1 min antes
    expect(rules.cumpleVentana(viaje, ahora)).toBe(true);
  });

  test('RN-02.2 con exactamente 48 horas NO se permite (debe faltar MÁS de 48 h)', () => {
    const ahora = new Date('2026-11-11T00:00:00-06:00');
    expect(rules.horasHastaViaje(viaje, ahora)).toBe(48);
    expect(rules.cumpleVentana(viaje, ahora)).toBe(false);
  });

  test('RN-02.3 con menos de 48 horas se rechaza con FUERA_DE_VENTANA', () => {
    const ahora = new Date('2026-11-12T10:00:00-06:00');
    expect(() => rules.validarVentana(viaje, ahora)).toThrow(expect.objectContaining({ code: 'FUERA_DE_VENTANA' }));
  });

  test('RN-02.4 el cliente no puede cancelar una reserva a menos de 48 horas del viaje', async () => {
    const { repo, reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva({ fecha: '2026-11-12' })); // 36 h
    await expect(
      reservas.cancelarReserva({ codigo: r.codigo, correo: 'cliente@correo.com' })
    ).rejects.toMatchObject({ code: 'FUERA_DE_VENTANA' });
    expect((await repo.getReservaPorCodigo(r.codigo)).estadoReserva).toBe('Pendiente');
  });

  test('RN-02.5 el cliente no puede cambiar la fecha a menos de 48 horas del viaje', async () => {
    const { reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva({ fecha: '2026-11-12' }));
    await expect(
      reservas.modificarFecha({ codigo: r.codigo, correo: 'cliente@correo.com', nuevaFecha: '2026-11-30' })
    ).rejects.toMatchObject({ code: 'FUERA_DE_VENTANA' });
  });
});

describe('RN-03 Fórmula de tarifa', () => {
  test('RN-03.1 total = (precio base × personas) × 1.13', () => {
    const c = rules.calcularCotizacion(100, 2);
    expect(c.subtotal).toBe(200);
    expect(c.iva).toBe(26);
    expect(c.total).toBe(226);
  });

  test('RN-03.2 aplica el IVA sobre decimales y redondea a centavos', () => {
    expect(rules.calcularCotizacion(85, 3).total).toBe(288.15);
    expect(rules.calcularCotizacion(33.33, 3).total).toBe(112.99); // 99.99 × 1.13 = 112.9887
  });

  test('RN-03.3 subtotal + IVA siempre es igual al total', () => {
    for (const [p, n] of [[19.99, 7], [120, 12], [0.5, 1], [85.55, 9]]) {
      const c = rules.calcularCotizacion(p, n);
      expect(Math.round((c.subtotal + c.iva) * 100)).toBe(Math.round(c.total * 100));
    }
  });

  test('RN-03.4 rechaza precios y cantidades inválidas', () => {
    expect(() => rules.calcularCotizacion(0, 2)).toThrow();
    expect(() => rules.calcularCotizacion(100, 0)).toThrow();
    expect(() => rules.calcularCotizacion(100, 1.5)).toThrow();
  });

  test('RN-03.5 la reserva guarda el monto calculado con la fórmula', async () => {
    const { reservas } = crearEntorno({ precio: 100 });
    const r = await reservas.crearReserva(datosReserva({ personas: 3 }));
    expect(r.total).toBe(339);
    expect(r.iva).toBe(39);
  });
});

describe('RN-04 Gateway simulado', () => {
  test('RN-04.1 tarjeta que termina en dígito par => Aprobado', () => {
    expect(rules.simularPago('4111111111111112').estadoPago).toBe('Aprobado');
    expect(rules.simularPago('4111111111111110').estadoPago).toBe('Aprobado'); // 0 es par
  });

  test('RN-04.2 tarjeta que termina en dígito impar => Rechazado', () => {
    expect(rules.simularPago('4111111111111111').estadoPago).toBe('Rechazado');
    expect(rules.simularPago('4111111111111119').estadoPago).toBe('Rechazado');
  });

  test('RN-04.3 ignora espacios y guiones y solo conserva los últimos 4 dígitos', () => {
    const p = rules.simularPago('4111 1111-1111 1114');
    expect(p.estadoPago).toBe('Aprobado');
    expect(p.ultimos4).toBe('1114');
  });

  test('RN-04.4 rechaza tarjetas con formato inválido', () => {
    expect(() => rules.simularPago('abcd')).toThrow(expect.objectContaining({ code: 'VALIDACION' }));
    expect(() => rules.simularPago('123')).toThrow();
    expect(() => rules.simularPago('')).toThrow();
  });

  test('RN-04.5 la reserva queda con el estado de pago del gateway y sin el número completo', async () => {
    const { reservas, repo } = crearEntorno();
    const ok = await reservas.crearReserva(datosReserva({ numeroTarjeta: '4000000000000002' }));
    const no = await reservas.crearReserva(datosReserva({ numeroTarjeta: '4000000000000001' }));
    expect(ok.estadoPago).toBe('Aprobado');
    expect(no.estadoPago).toBe('Rechazado');
    const guardada = await repo.getReservaPorCodigo(ok.codigo);
    expect(JSON.stringify(guardada)).not.toContain('4000000000000002');
    expect(guardada.tarjetaUltimos4).toBe('0002');
  });
});
