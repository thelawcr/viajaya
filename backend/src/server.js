'use strict';
require('dotenv').config();
const path = require('path');
const { crearApp } = require('./app');
const { crearReservaService } = require('./services/reservaService');
const { crearAdminService } = require('./services/adminService');
const { crearAuthService, credencialesDemo, credencialesSupabase } = require('./services/authService');
const { MemoryRepository } = require('./repositories/memoryRepository');

function datosDemo() {
  return {
    destinos: [
      { nombre: 'Volcán Arenal', descripcion: 'Caminata y aguas termales', precioBase: 85, capacidadDiaria: 20 },
      { nombre: 'Parque Nacional Tortuguero', descripcion: 'Tour en lancha por los canales', precioBase: 120, capacidadDiaria: 12 },
      { nombre: 'Rafting Río Pacuare', descripcion: 'Aventura de aguas bravas', precioBase: 95, capacidadDiaria: 16 },
    ],
    reservas: [],
  };
}

function main() {
  const jwtSecret = process.env.JWT_SECRET || 'secreto-solo-para-desarrollo';
  const usaSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  let repo;
  let verificar;

  if (usaSupabase) {
    const { createClient } = require('@supabase/supabase-js');
    const { SupabaseRepository } = require('./repositories/supabaseRepository');
    const opts = { auth: { persistSession: false, autoRefreshToken: false } };
    repo = new SupabaseRepository(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, opts));
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY, opts);
    verificar = credencialesSupabase(anon);
    console.log('Persistencia: PostgreSQL (Supabase)');
  } else {
    repo = new MemoryRepository(datosDemo());
    verificar = credencialesDemo(process.env.DEMO_ADMIN_EMAIL || 'admin@viajaya.test', process.env.DEMO_ADMIN_PASSWORD || 'Admin123!');
    console.log('MODO DEMOSTRACIÓN: datos en memoria (se pierden al reiniciar). Configure SUPABASE_URL para persistir.');
  }

  const app = crearApp({
    reservas: crearReservaService({ repo }),
    admin: crearAdminService({ repo }),
    auth: crearAuthService({ verificarCredenciales: verificar, jwtSecret, expiresIn: process.env.JWT_EXPIRES_IN || '8h' }),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    frontendDist: process.env.FRONTEND_DIST || path.join(__dirname, '..', '..', 'frontend', 'dist'),
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`ViajaYa API escuchando en el puerto ${port}`));
}

main();
