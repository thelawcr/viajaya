'use strict';
/**
 * Registro de auditoría (trazabilidad). Cada acción relevante del administrador
 * y de los clientes deja una entrada con quién, qué, sobre qué y cuándo.
 *
 * El registro es "de mejor esfuerzo": si falla el guardado de la entrada, la
 * operación de negocio ya realizada no se revierte; el error se informa en el
 * log del servidor para poder corregirlo.
 */
function crearAuditor(repo) {
  return async function auditar({ actor, accion, entidad, entidadId = null, detalle = {} }) {
    try {
      await repo.registrarAuditoria({
        actor: actor || 'sistema',
        accion,
        entidad,
        entidadId: entidadId == null ? null : String(entidadId),
        detalle,
      });
    } catch (err) {
      console.error('No se pudo registrar la auditoría:', accion, err.message);
    }
  };
}

module.exports = { crearAuditor };
