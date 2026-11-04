'use strict';
/**
 * Pruebas de trazabilidad con el SRS (E2): detalles de los casos de uso CU-01, CU-02,
 * CU-05 y CU-06 (RF-10) que complementan las pruebas de reglas y de requerimientos.
 */
const request = require('supertest');
const { crearApp } = require('../src/app');
const { crearAuthService, credencialesDemo } = require('../src/services/authService');
const { crearEntorno, datosReserva } = require('./helpers');

describe('CU-02 Realizar reserva: dato de contacto (teléfono)', () => {
  test('CU-02.1 el teléfono es obligatorio', async () => {
    const { reservas } = crearEntorno();
    const { telefonoCliente, ...sinTelefono } = datosReserva();
    await expect(reservas.crearReserva(sinTelefono)).rejects.toMatchObject({ code: 'VALIDACION' });
  });

  test.each([['abc'], ['123'], ['12345678901234567890'], ['8888-12ab']])(
    'CU-02.2 rechaza el teléfono inválido "%s"',
    async (tel) => {
      const { reservas } = crearEntorno();
      await expect(reservas.crearReserva(datosReserva({ telefonoCliente: tel }))).rejects.toMatchObject({ code: 'VALIDACION' });
    }
  );

  test('CU-02.3 el teléfono se guarda y se devuelve al consultar la reserva', async () => {
    const { reservas } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva({ telefonoCliente: '(506) 8888-1234' }));
    expect(r.telefonoCliente).toBe('(506) 8888-1234');
    const c = await reservas.consultarReserva({ codigo: r.codigo, correo: 'cliente@correo.com' });
    expect(c.telefonoCliente).toBe('(506) 8888-1234');
  });
});

describe('CU-01 flujo 4b: cupo insuficiente informa los lugares libres', () => {
  test('CU-01.1 el mensaje indica cuántos lugares quedan', async () => {
    const { reservas } = crearEntorno({ capacidad: 10 });
    await reservas.crearReserva(datosReserva({ personas: 9 }));
    await expect(reservas.crearReserva(datosReserva({ personas: 2, correoCliente: 'otro@correo.com' }))).rejects.toMatchObject({
      code: 'CUPO_EXCEDIDO',
      message: expect.stringContaining('quedan 1 lugar libre'),
    });
  });

  test('CU-01.2 con la fecha llena indica que quedan 0 lugares', async () => {
    const { reservas } = crearEntorno({ capacidad: 4 });
    await reservas.crearReserva(datosReserva({ personas: 4 }));
    await expect(reservas.crearReserva(datosReserva({ personas: 1, correoCliente: 'otro@correo.com' }))).rejects.toMatchObject({
      message: expect.stringContaining('quedan 0 lugares libres'),
    });
  });
});

describe('CU-05 Administrar reservas: reactivar una reserva cancelada (RN-01)', () => {
  async function reservaCancelada(entorno, extra = {}) {
    const r = await entorno.reservas.crearReserva(datosReserva(extra));
    const interna = await entorno.repo.getReservaPorCodigo(r.codigo);
    await entorno.admin.cancelarReserva(interna.id, 'admin@viajaya.test');
    return interna;
  }

  test('CU-05.1 reactiva (Aprobada) si todavía hay cupo y lo deja en la auditoría', async () => {
    const e = crearEntorno({ capacidad: 10 });
    const r = await reservaCancelada(e, { personas: 3 });
    const nueva = await e.admin.aprobarReserva(r.id, 'admin@viajaya.test');
    expect(nueva.estadoReserva).toBe('Aprobada');
    const acciones = (await e.admin.listarAuditoria()).map((x) => x.accion);
    expect(acciones).toContain('RESERVA_REACTIVADA');
  });

  test('CU-05.2 bloquea la reactivación si otros clientes ya llenaron el cupo (RN-01)', async () => {
    const e = crearEntorno({ capacidad: 5 });
    const r = await reservaCancelada(e, { personas: 3 });
    await e.reservas.crearReserva(datosReserva({ personas: 5, correoCliente: 'otro@correo.com' }));
    await expect(e.admin.aprobarReserva(r.id, 'admin@viajaya.test')).rejects.toMatchObject({ code: 'CUPO_EXCEDIDO' });
    expect((await e.repo.getReserva(r.id)).estadoReserva).toBe('Cancelada');
  });

  test('CU-05.3 no reactiva una reserva cuya fecha de viaje ya pasó', async () => {
    const e = crearEntorno();
    const pasada = await e.repo.crearReservaAtomica({
      codigo: 'VY-PASADA01', destinoId: 'dest-1', fechaViaje: '2026-11-01', personas: 1,
      nombreCliente: 'X', correoCliente: 'x@correo.com', telefonoCliente: '88881234',
      montoSubtotal: 100, montoIva: 13, montoTotal: 113, estadoReserva: 'Cancelada', estadoPago: 'Aprobado',
    });
    await expect(e.admin.aprobarReserva(pasada.id, 'admin@viajaya.test')).rejects.toMatchObject({ code: 'VALIDACION' });
  });

  test('CU-05.4 aprobar una reserva Pendiente no requiere nueva verificación y no está sujeta a RN-02', async () => {
    const e = crearEntorno({ capacidad: 2 });
    const r = await e.reservas.crearReserva(datosReserva({ personas: 2, fecha: '2026-11-11' })); // < 48 h
    const interna = await e.repo.getReservaPorCodigo(r.codigo);
    const nueva = await e.admin.aprobarReserva(interna.id, 'admin@viajaya.test');
    expect(nueva.estadoReserva).toBe('Aprobada');
  });
});

describe('CU-06 / RF-10 Autenticación del administrador', () => {
  function servidor() {
    const e = crearEntorno();
    const auth = crearAuthService({ verificarCredenciales: credencialesDemo('admin@viajaya.test', 'Admin123!'), jwtSecret: 'secreto-de-prueba' });
    return crearApp({ reservas: e.reservas, admin: e.admin, auth });
  }

  test('RF-10.1 credenciales válidas devuelven un JWT que abre las rutas protegidas', async () => {
    const app = servidor();
    const login = await request(app).post('/api/admin/login').send({ email: 'admin@viajaya.test', password: 'Admin123!' });
    expect(login.status).toBe(200);
    const r = await request(app).get('/api/admin/reservas').set('Authorization', `Bearer ${login.body.token}`);
    expect(r.status).toBe(200);
  });

  test('RF-10.2 credenciales incorrectas responden 401 con mensaje genérico', async () => {
    const app = servidor();
    const r1 = await request(app).post('/api/admin/login').send({ email: 'admin@viajaya.test', password: 'mala' });
    const r2 = await request(app).post('/api/admin/login').send({ email: 'otro@viajaya.test', password: 'Admin123!' });
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r1.body.error.mensaje).toBe(r2.body.error.mensaje);
  });

  test('RF-10.3 sin token o con token inválido las rutas de administración responden 401', async () => {
    const app = servidor();
    expect((await request(app).get('/api/admin/reservas')).status).toBe(401);
    expect((await request(app).get('/api/admin/reservas').set('Authorization', 'Bearer basura')).status).toBe(401);
  });
});
