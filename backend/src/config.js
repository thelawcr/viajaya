'use strict';
/**
 * Validación del entorno de ejecución. En producción (NODE_ENV=production, que Render
 * define automáticamente al ejecutar) el servidor no debe arrancar en modo demostración
 * por error ni con un secreto JWT débil: se detiene con un mensaje claro.
 */
function validarEntorno(env = process.env) {
  const errores = [];
  const produccion = env.NODE_ENV === 'production';
  const usaSupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);

  if (produccion) {
    if (!usaSupabase && env.ALLOW_DEMO !== 'true') {
      errores.push('Falta SUPABASE_URL o SUPABASE_SERVICE_KEY: en producción los datos deben persistir en Supabase (use ALLOW_DEMO=true solo para una demostración).');
    }
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      errores.push('JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.');
    }
  }
  return { produccion, usaSupabase, errores };
}

module.exports = { validarEntorno };
