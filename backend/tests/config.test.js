'use strict';
const { validarEntorno } = require('../src/config');

const SECRETO = 'a'.repeat(40);

describe('Configuración del entorno (despliegue)', () => {
  test('CFG-01 en desarrollo (sin NODE_ENV) se permite el modo demostración', () => {
    expect(validarEntorno({}).errores).toEqual([]);
  });

  test('CFG-02 en producción exige Supabase y un JWT_SECRET largo', () => {
    const r = validarEntorno({ NODE_ENV: 'production' });
    expect(r.errores).toHaveLength(2);
  });

  test('CFG-03 en producción con Supabase y secreto de 32 o más caracteres es válido', () => {
    const r = validarEntorno({ NODE_ENV: 'production', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k', JWT_SECRET: SECRETO });
    expect(r.errores).toEqual([]);
    expect(r.usaSupabase).toBe(true);
  });

  test('CFG-04 un JWT_SECRET corto se rechaza en producción y ALLOW_DEMO permite la demostración', () => {
    const corto = validarEntorno({ NODE_ENV: 'production', ALLOW_DEMO: 'true', JWT_SECRET: 'corto' });
    expect(corto.errores).toHaveLength(1);
    const demo = validarEntorno({ NODE_ENV: 'production', ALLOW_DEMO: 'true', JWT_SECRET: SECRETO });
    expect(demo.errores).toEqual([]);
  });
});
