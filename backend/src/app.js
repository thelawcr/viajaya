'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { AppError, noAutorizado } = require('./domain/errors');


function crearApp({ reservas, admin, auth, corsOrigin = '*', frontendDist = null }) {
  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '50kb' }));

  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  app.get('/api/health', (req, res) => res.json({ status: 'ok', servicio: 'ViajaYa API' }));

  // ---------------- Módulo de clientes ----------------
  app.get('/api/destinos', ah(async (req, res) => res.json(await reservas.listarDestinos())));

  // RF-01
  app.get('/api/disponibilidad', ah(async (req, res) => {
    res.json(await reservas.buscarDisponibilidad({
      destinoId: req.query.destinoId,
      fecha: req.query.fecha,
      personas: req.query.personas,
    }));
  }));

  // RF-02
  app.get('/api/cotizacion', ah(async (req, res) => {
    res.json(await reservas.cotizar({ destinoId: req.query.destinoId, personas: req.query.personas }));
  }));

  // RF-03
  app.post('/api/reservas', ah(async (req, res) => {
    res.status(201).json(await reservas.crearReserva(req.body || {}));
  }));

  // RF-04 (POST para no exponer el correo en la URL)
  app.post('/api/reservas/consulta', ah(async (req, res) => {
    res.json(await reservas.consultarReserva(req.body || {}));
  }));

  // RF-05
  app.patch('/api/reservas/:codigo/fecha', ah(async (req, res) => {
    res.json(await reservas.modificarFecha({
      codigo: req.params.codigo,
      correo: req.body?.correo,
      nuevaFecha: req.body?.nuevaFecha,
    }));
  }));

  // RF-06
  app.post('/api/reservas/:codigo/cancelar', ah(async (req, res) => {
    res.json(await reservas.cancelarReserva({ codigo: req.params.codigo, correo: req.body?.correo }));
  }));

  // ---------------- Módulo de administración ----------------
  app.post('/api/admin/login', ah(async (req, res) => {
    res.json(await auth.login(req.body?.email, req.body?.password));
  }));

  const requiereAdmin = (req, res, next) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return next(noAutorizado('Falta el token de autenticación'));
    try {
      req.admin = auth.verificarToken(h.slice(7));
      next();
    } catch (e) {
      next(e);
    }
  };
  app.use('/api/admin', (req, res, next) => (req.path === '/login' ? next() : requiereAdmin(req, res, next)));

  // RF-07
  app.get('/api/admin/destinos', ah(async (req, res) => res.json(await admin.listarDestinos())));
  app.post('/api/admin/destinos', ah(async (req, res) => res.status(201).json(await admin.crearDestino(req.body || {}))));
  app.put('/api/admin/destinos/:id', ah(async (req, res) => res.json(await admin.editarDestino(req.params.id, req.body || {}))));
  app.patch('/api/admin/destinos/:id/desactivar', ah(async (req, res) => res.json(await admin.desactivarDestino(req.params.id))));
  app.patch('/api/admin/destinos/:id/activar', ah(async (req, res) => res.json(await admin.activarDestino(req.params.id))));

  // RF-08
  app.get('/api/admin/reservas', ah(async (req, res) => res.json(await admin.listarReservas())));
  app.patch('/api/admin/reservas/:id/aprobar', ah(async (req, res) => res.json(await admin.aprobarReserva(req.params.id))));
  app.patch('/api/admin/reservas/:id/cancelar', ah(async (req, res) => res.json(await admin.cancelarReserva(req.params.id))));
  app.delete('/api/admin/reservas/:id', ah(async (req, res) => res.json(await admin.eliminarReserva(req.params.id))));

  // RF-09
  app.patch('/api/admin/reservas/:id/pago', ah(async (req, res) => {
    res.json(await admin.cambiarEstadoPago(req.params.id, req.body?.estadoPago));
  }));

  // ---------------- Frontend compilado (despliegue en un solo servicio) ----------------
  if (frontendDist && fs.existsSync(path.join(frontendDist, 'index.html'))) {
    app.use(express.static(frontendDist));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  }

  app.use('/api', (req, res, next) => next(new AppError('NO_ENCONTRADO', 'Ruta no encontrada', 404)));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { codigo: err.code, mensaje: err.message } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { codigo: 'VALIDACION', mensaje: 'El cuerpo de la solicitud no es JSON válido' } });
    }
    console.error(err);
    res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } });
  });

  return app;
}

module.exports = { crearApp };
