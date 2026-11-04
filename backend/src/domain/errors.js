'use strict';

/** Error de aplicación con código estable y estado HTTP asociado. */
class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

const validacion = (msg) => new AppError('VALIDACION', msg, 400);
const noEncontrado = (msg = 'Recurso no encontrado') => new AppError('NO_ENCONTRADO', msg, 404);
const cupoExcedido = (msg = 'No hay cupo disponible para la fecha y cantidad de personas solicitadas') =>
  new AppError('CUPO_EXCEDIDO', msg, 409);
const fueraDeVentana = (
  msg = 'Solo se puede cambiar la fecha o cancelar si faltan más de 48 horas para el viaje'
) => new AppError('FUERA_DE_VENTANA', msg, 409);
const noAutorizado = (msg = 'Credenciales inválidas o sesión expirada') =>
  new AppError('NO_AUTORIZADO', msg, 401);

module.exports = { AppError, validacion, noEncontrado, cupoExcedido, fueraDeVentana, noAutorizado };
