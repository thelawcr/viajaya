'use strict';
const { validacion } = require('./errors');

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PERSONAS_POR_RESERVA = 50;

function texto(valor, campo, { max = 120 } = {}) {
  const t = String(valor ?? '').trim();
  if (!t) throw validacion(`El campo "${campo}" es obligatorio`);
  if (t.length > max) throw validacion(`El campo "${campo}" no puede superar ${max} caracteres`);
  return t;
}

function correo(valor) {
  const c = String(valor ?? '').trim().toLowerCase();
  if (!REGEX_CORREO.test(c)) throw validacion('El correo electrónico no es válido');
  return c;
}

function entero(valor, campo, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw validacion(`El campo "${campo}" debe ser un entero entre ${min} y ${max}`);
  }
  return n;
}

function monto(valor, campo) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    throw validacion(`El campo "${campo}" debe ser un número mayor que cero`);
  }
  return Math.round(n * 100) / 100;
}

function codigoReserva(valor) {
  return texto(valor, 'código de reserva', { max: 30 }).toUpperCase();
}

module.exports = { texto, correo, entero, monto, codigoReserva, MAX_PERSONAS_POR_RESERVA };
