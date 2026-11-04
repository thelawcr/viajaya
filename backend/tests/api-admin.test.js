'use strict';
/**
 * Pruebas de la API HTTP (supertest) y del módulo de administración RF-07 a RF-09.
 */
const request = require('supertest');
const { crearApp } = require('../src/app');
const { crearAuthService, credencialesDemo } = require('../src/services/authService');
const { crearEntorno, datosReserva, DESTINO_ID } = require('./helpers');

function crearServidor() {
  const entorno = crearEntorno({ capacidad: 10, precio: 100 });
  const auth = crearAuthService({
    verificarCredenciales: credencialesDemo('admin@viajaya.test', 'Admin123!'),
    jwtSecret: 'secreto-de-prueba',
  });
  const app = crearApp({ reservas: entorno.reservas, admin: entorno.admin, auth });
  return { app, ...entorno };
}

async function tokenAdmin(app) {
  const r = await request(app).post('/api/admin/login').send({ email: 'admin@viajaya.test', password: 'Admin123!' });
  return r.body.token;
}

describe('API pública (RF-01 a RF-06 por HTTP)', () => {
  test('flujo completo: disponibilidad, cotización, reserva, consulta, cambio de fecha y cancelación', async () => {
    const { app } = crearServidor();

    const disp = await request(app).get('/api/disponibilidad').query({ destinoId: DESTINO_ID, fecha: '2026-11-20', personas: 2 });
    expect(disp.status).toBe(200);
    expect(disp.body.cotizacion.total).toBe(226);

    const cot = await request(app).get('/api/cotizacion').query({ destinoId: DESTINO_ID, personas: 2 });
    expect(cot.body).toMatchObject({ subtotal: 200, iva: 26, total: 226 });

    const crea = await request(app).post('/api/reservas').send({
      destinoId: DESTINO_ID, fecha: '2026-11-20', personas: 2, nombreCliente: 'Ana', correoCliente: 'ana@correo.com', numeroTarjeta: '4242424242424242',
    });
    expect(crea.status).toBe(201);
    expect(crea.body.estadoPago).toBe('Aprobado');
    expect(crea.body.id).toBeUndefined(); // no se exponen ids internos
    const { codigo } = crea.body;

    const cons = await request(app).post('/api/reservas/consulta').send({ codigo, correo: 'ana@correo.com' });
    expect(cons.status).toBe(200);

    const mov = await request(app).patch(`/api/reservas/${codigo}/fecha`).send({ correo: 'ana@correo.com', nuevaFecha: '2026-11-27' });
    expect(mov.body.fechaViaje).toBe('2026-11-27');

    const can = await request(app).post(`/api/reservas/${codigo}/cancelar`).send({ correo: 'ana@correo.com' });
    expect(can.body.estadoReserva).toBe('Cancelada');
  });

  test('responde con códigos HTTP y mensajes de error coherentes', async () => {
    const { app } = crearServidor();
    const sinCupo = await request(app).post('/api/reservas').send({
      destinoId: DESTINO_ID, fecha: '2026-11-20', personas: 11, nombreCliente: 'Ana', correoCliente: 'ana@correo.com', numeroTarjeta: '4242424242424242',
    });
    expect(sinCupo.status).toBe(409);
    expect(sinCupo.body.error.codigo).toBe('CUPO_EXCEDIDO');

    const invalida = await request(app).post('/api/reservas').send({});
    expect(invalida.status).toBe(404); // destino inexistente

    const ruta = await request(app).get('/api/no-existe');
    expect(ruta.status).toBe(404);
  });
});

describe('Seguridad del módulo de administración', () => {
  test('rechaza el acceso sin token o con token inválido', async () => {
    const { app } = crearServidor();
    expect((await request(app).get('/api/admin/reservas')).status).toBe(401);
    expect((await request(app).get('/api/admin/reservas').set('Authorization', 'Bearer falso')).status).toBe(401);
  });

  test('login con credenciales incorrectas devuelve 401', async () => {
    const { app } = crearServidor();
    const r = await request(app).post('/api/admin/login').send({ email: 'admin@viajaya.test', password: 'mala' });
    expect(r.status).toBe(401);
  });

  test('login correcto entrega un JWT que permite listar reservas', async () => {
    const { app } = crearServidor();
    const token = await tokenAdmin(app);
    const r = await request(app).get('/api/admin/reservas').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

describe('RF-07 CRUD de destinos', () => {
  test('crea, edita, lista y desactiva destinos', async () => {
    const { app } = crearServidor();
    const t = await tokenAdmin(app);
    const h = { Authorization: `Bearer ${t}` };

    const nuevo = await request(app).post('/api/admin/destinos').set(h).send({ nombre: 'Playa Manuel Antonio', precioBase: 60, capacidadDiaria: 30 });
    expect(nuevo.status).toBe(201);
    expect(nuevo.body.activo).toBe(true);

    const edit = await request(app).put(`/api/admin/destinos/${nuevo.body.id}`).set(h).send({ precioBase: 65, capacidadDiaria: 25 });
    expect(edit.body).toMatchObject({ precioBase: 65, capacidadDiaria: 25, nombre: 'Playa Manuel Antonio' });

    const des = await request(app).patch(`/api/admin/destinos/${nuevo.body.id}/desactivar`).set(h);
    expect(des.body.activo).toBe(false);

    const publicos = await request(app).get('/api/destinos');
    expect(publicos.body.find((d) => d.id === nuevo.body.id)).toBeUndefined();
    const admin = await request(app).get('/api/admin/destinos').set(h);
    expect(admin.body.find((d) => d.id === nuevo.body.id)).toBeDefined();
  });

  test('valida nombre, precio y capacidad', async () => {
    const { admin } = crearServidor();
    await expect(admin.crearDestino({ nombre: '', precioBase: 10, capacidadDiaria: 5 })).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(admin.crearDestino({ nombre: 'X', precioBase: -5, capacidadDiaria: 5 })).rejects.toMatchObject({ code: 'VALIDACION' });
    await expect(admin.crearDestino({ nombre: 'X', precioBase: 10, capacidadDiaria: 0 })).rejects.toMatchObject({ code: 'VALIDACION' });
  });

  test('un destino desactivado conserva sus reservas existentes', async () => {
    const { admin, reservas, repo } = crearServidor();
    await reservas.crearReserva(datosReserva());
    await admin.desactivarDestino(DESTINO_ID);
    expect(await repo.listReservas()).toHaveLength(1);
    await expect(reservas.crearReserva(datosReserva())).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});

describe('RF-08 Gestión de reservas', () => {
  test('lista, aprueba, cancela y elimina reservas', async () => {
    const { app, reservas } = crearServidor();
    const h = { Authorization: `Bearer ${await tokenAdmin(app)}` };
    await reservas.crearReserva(datosReserva());
    await reservas.crearReserva(datosReserva({ correoCliente: 'b@correo.com' }));

    const lista = await request(app).get('/api/admin/reservas').set(h);
    expect(lista.body).toHaveLength(2);
    const [a, b] = lista.body;

    const aprob = await request(app).patch(`/api/admin/reservas/${a.id}/aprobar`).set(h);
    expect(aprob.body.estadoReserva).toBe('Aprobada');

    const canc = await request(app).patch(`/api/admin/reservas/${b.id}/cancelar`).set(h);
    expect(canc.body.estadoReserva).toBe('Cancelada');

    const noAprobar = await request(app).patch(`/api/admin/reservas/${b.id}/aprobar`).set(h);
    expect(noAprobar.status).toBe(400);

    const del = await request(app).delete(`/api/admin/reservas/${a.id}`).set(h);
    expect(del.body.eliminada).toBe(true);
    expect((await request(app).get('/api/admin/reservas').set(h)).body).toHaveLength(1);
  });

  test('el administrador puede cancelar aunque falten menos de 48 horas (RN-02 aplica solo al cliente)', async () => {
    const { admin, reservas, repo } = crearServidor();
    const r = await reservas.crearReserva(datosReserva({ fecha: '2026-11-11' }));
    const interna = await repo.getReservaPorCodigo(r.codigo);
    const c = await admin.cancelarReserva(interna.id);
    expect(c.estadoReserva).toBe('Cancelada');
  });

  test('eliminar o aprobar una reserva inexistente devuelve 404', async () => {
    const { app } = crearServidor();
    const h = { Authorization: `Bearer ${await tokenAdmin(app)}` };
    expect((await request(app).delete('/api/admin/reservas/no-existe').set(h)).status).toBe(404);
    expect((await request(app).patch('/api/admin/reservas/no-existe/aprobar').set(h)).status).toBe(404);
  });
});

describe('RF-09 Simulación de cobro', () => {
  test('el administrador cambia el estado de pago entre Pendiente, Aprobado y Rechazado', async () => {
    const { app, reservas, repo } = crearServidor();
    const h = { Authorization: `Bearer ${await tokenAdmin(app)}` };
    const r = await reservas.crearReserva(datosReserva({ numeroTarjeta: '4000000000000001' })); // Rechazado
    const id = (await repo.getReservaPorCodigo(r.codigo)).id;
    expect(r.estadoPago).toBe('Rechazado');

    for (const estado of ['Aprobado', 'Pendiente', 'Rechazado']) {
      const res = await request(app).patch(`/api/admin/reservas/${id}/pago`).set(h).send({ estadoPago: estado });
      expect(res.status).toBe(200);
      expect(res.body.estadoPago).toBe(estado);
    }
  });

  test('rechaza un estado de pago no permitido', async () => {
    const { app, reservas, repo } = crearServidor();
    const h = { Authorization: `Bearer ${await tokenAdmin(app)}` };
    const r = await reservas.crearReserva(datosReserva());
    const id = (await repo.getReservaPorCodigo(r.codigo)).id;
    const res = await request(app).patch(`/api/admin/reservas/${id}/pago`).set(h).send({ estadoPago: 'Reembolsado' });
    expect(res.status).toBe(400);
  });
});
