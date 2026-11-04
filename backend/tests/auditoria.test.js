'use strict';
/**
 * Pruebas del registro de auditoría (trazabilidad): las acciones del
 * administrador y de los clientes deben quedar registradas.
 */
const request = require('supertest');
const { crearApp } = require('../src/app');
const { crearAuthService, credencialesDemo } = require('../src/services/authService');
const { crearAdminService } = require('../src/services/adminService');
const { crearEntorno, datosReserva, DESTINO_ID } = require('./helpers');

const ADMIN = 'admin@viajaya.test';

function crearServidor() {
  const entorno = crearEntorno({ capacidad: 10, precio: 100 });
  const auth = crearAuthService({ verificarCredenciales: credencialesDemo(ADMIN, 'Admin123!'), jwtSecret: 'secreto-de-prueba' });
  const app = crearApp({ reservas: entorno.reservas, admin: entorno.admin, auth });
  return { app, ...entorno };
}

async function cabecera(app) {
  const r = await request(app).post('/api/admin/login').send({ email: ADMIN, password: 'Admin123!' });
  return { Authorization: `Bearer ${r.body.token}` };
}

describe('Auditoría de acciones del administrador', () => {
  test('AUD-01 registra la creación y edición de destinos con el actor y los cambios', async () => {
    const { admin, repo } = crearEntorno();
    const d = await admin.crearDestino({ nombre: 'Playa Cahuita', precioBase: 40, capacidadDiaria: 15 }, ADMIN);
    await admin.editarDestino(d.id, { precioBase: 45 }, ADMIN);

    const log = await repo.listAuditoria();
    expect(log.map((e) => e.accion)).toEqual(['DESTINO_EDITADO', 'DESTINO_CREADO']); // más reciente primero
    expect(log[0].actor).toBe(ADMIN);
    expect(log[0].detalle.cambios.precioBase).toEqual({ de: 40, a: 45 });
  });

  test('AUD-02 registra aprobar, cancelar y cambiar el pago de una reserva', async () => {
    const { admin, reservas, repo } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva({ numeroTarjeta: '4000000000000001' }));
    const id = (await repo.getReservaPorCodigo(r.codigo)).id;

    await admin.aprobarReserva(id, ADMIN);
    await admin.cambiarEstadoPago(id, 'Aprobado', ADMIN);
    await admin.cancelarReserva(id, ADMIN);

    const acciones = (await repo.listAuditoria()).map((e) => e.accion);
    expect(acciones).toEqual(['RESERVA_CANCELADA_ADMIN', 'PAGO_MODIFICADO', 'RESERVA_APROBADA', 'RESERVA_CREADA']);

    const pago = (await repo.listAuditoria()).find((e) => e.accion === 'PAGO_MODIFICADO');
    expect(pago.detalle).toMatchObject({ codigo: r.codigo, de: 'Rechazado', a: 'Aprobado' });
  });

  test('AUD-03 al eliminar una reserva el rastro conserva su código y datos', async () => {
    const { admin, reservas, repo } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva());
    const id = (await repo.getReservaPorCodigo(r.codigo)).id;
    await admin.eliminarReserva(id, ADMIN);

    expect(await repo.getReserva(id)).toBeNull();
    const eliminada = (await repo.listAuditoria()).find((e) => e.accion === 'RESERVA_ELIMINADA');
    expect(eliminada.actor).toBe(ADMIN);
    expect(eliminada.entidadId).toBe(id);
    expect(eliminada.detalle).toMatchObject({ codigo: r.codigo, personas: 2, total: 226 });
  });

  test('AUD-04 una acción rechazada por validación no deja registro', async () => {
    const { admin, repo } = crearEntorno();
    await expect(admin.cambiarEstadoPago('no-existe', 'Aprobado', ADMIN)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(admin.crearDestino({ nombre: '', precioBase: 1, capacidadDiaria: 1 }, ADMIN)).rejects.toMatchObject({ code: 'VALIDACION' });
    expect(await repo.listAuditoria()).toHaveLength(0);
  });

  test('AUD-05 sin actor se registra como "sistema"', async () => {
    const { admin, repo } = crearEntorno();
    await admin.desactivarDestino(DESTINO_ID);
    expect((await repo.listAuditoria())[0].actor).toBe('sistema');
  });
});

describe('Auditoría de acciones del cliente', () => {
  test('AUD-06 registra crear, cambiar fecha y cancelar una reserva con el correo del cliente', async () => {
    const { reservas, repo } = crearEntorno();
    const r = await reservas.crearReserva(datosReserva({ fecha: '2026-11-20' }));
    await reservas.modificarFecha({ codigo: r.codigo, correo: 'cliente@correo.com', nuevaFecha: '2026-11-27' });
    await reservas.cancelarReserva({ codigo: r.codigo, correo: 'cliente@correo.com' });

    const log = await repo.listAuditoria();
    expect(log.map((e) => e.accion)).toEqual(['RESERVA_CANCELADA_CLIENTE', 'RESERVA_FECHA_CAMBIADA', 'RESERVA_CREADA']);
    expect(log.every((e) => e.actor === 'cliente:cliente@correo.com')).toBe(true);
    expect(log[1].detalle).toMatchObject({ codigo: r.codigo, de: '2026-11-20', a: '2026-11-27' });
  });

  test('AUD-07 una reserva rechazada por cupo o por ventana no deja registro', async () => {
    const { reservas, repo } = crearEntorno({ capacidad: 5 });
    await expect(reservas.crearReserva(datosReserva({ personas: 6 }))).rejects.toMatchObject({ code: 'CUPO_EXCEDIDO' });
    const cerca = await reservas.crearReserva(datosReserva({ personas: 1, fecha: '2026-11-12' })); // 36 h
    await expect(reservas.cancelarReserva({ codigo: cerca.codigo, correo: 'cliente@correo.com' })).rejects.toMatchObject({ code: 'FUERA_DE_VENTANA' });
    expect((await repo.listAuditoria()).map((e) => e.accion)).toEqual(['RESERVA_CREADA']);
  });

  test('AUD-08 el número de tarjeta nunca aparece en el registro', async () => {
    const { reservas, repo } = crearEntorno();
    await reservas.crearReserva(datosReserva({ numeroTarjeta: '4000000000000002' }));
    expect(JSON.stringify(await repo.listAuditoria())).not.toContain('4000000000000002');
  });
});

describe('Registro de auditoría: API y robustez', () => {
  test('AUD-09 GET /api/admin/auditoria exige token y devuelve el registro con el actor real', async () => {
    const { app, reservas } = crearServidor();
    expect((await request(app).get('/api/admin/auditoria')).status).toBe(401);

    const h = await cabecera(app);
    const r = await reservas.crearReserva(datosReserva());
    const lista = await request(app).get('/api/admin/reservas').set(h);
    await request(app).patch(`/api/admin/reservas/${lista.body[0].id}/aprobar`).set(h);

    const log = await request(app).get('/api/admin/auditoria').set(h);
    expect(log.status).toBe(200);
    expect(log.body[0]).toMatchObject({ accion: 'RESERVA_APROBADA', actor: ADMIN });
    expect(log.body[0].detalle.codigo).toBe(r.codigo);
  });

  test('AUD-10 el parámetro limite acota la cantidad de entradas', async () => {
    const { app, reservas } = crearServidor();
    const h = await cabecera(app);
    for (let i = 0; i < 3; i++) await reservas.crearReserva(datosReserva({ personas: 1 }));
    expect((await request(app).get('/api/admin/auditoria?limite=2').set(h)).body).toHaveLength(2);
    expect((await request(app).get('/api/admin/auditoria?limite=abc').set(h)).body).toHaveLength(3);
  });

  test('AUD-11 si falla el guardado de la auditoría, la operación de negocio igual se completa', async () => {
    const { repo } = crearEntorno();
    repo.registrarAuditoria = async () => { throw new Error('BD caída'); };
    const admin = crearAdminService({ repo });
    const silenciar = jest.spyOn(console, 'error').mockImplementation(() => {});

    const d = await admin.crearDestino({ nombre: 'Nuevo', precioBase: 10, capacidadDiaria: 5 }, ADMIN);
    expect(d.nombre).toBe('Nuevo');
    expect(silenciar).toHaveBeenCalled();
    silenciar.mockRestore();
  });

  test('AUD-12 el registro en memoria es de solo agregar (los cambios externos no lo alteran)', async () => {
    const { admin, repo } = crearEntorno();
    await admin.desactivarDestino(DESTINO_ID, ADMIN);
    const copia = await repo.listAuditoria();
    copia[0].actor = 'intruso';
    copia.length = 0;
    expect((await repo.listAuditoria())[0].actor).toBe(ADMIN);
  });
});
