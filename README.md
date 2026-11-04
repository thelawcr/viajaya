# ViajaYa — Sistema de Reservas Turísticas Autoservicio

Proyecto Integrador RUP (IF6100) · Entregable 3: Fase de Construcción.

Plataforma web para consultar destinos, cotizar, reservar con pago simulado y administrar destinos y reservas.

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Node.js + Express (API REST, JWT para administración) |
| Base de datos | PostgreSQL en Supabase, con RLS habilitado |
| Pruebas | Jest + Supertest |
| Despliegue | Render (un solo servicio) · subdominio opcional con Dynu |

## Estructura

```
viajaya/
├── backend/            API REST, reglas de negocio y pruebas
│   ├── src/domain/         reglas RN-01..RN-04 (puras), validadores y errores
│   ├── src/services/       casos de uso RF-01..RF-09 y autenticación JWT
│   ├── src/repositories/   memoria (pruebas/demo) y Supabase (producción)
│   └── tests/              suite de pruebas unitarias automatizadas
├── frontend/           aplicación React
├── database/           schema.sql (tablas, RLS, funciones) y seed.sql
└── docs/               API Docs (documentación de código e interfaz)
```

## Ejecución local rápida (modo demostración, sin Supabase)

```bash
cd backend && npm install && cp .env.example .env && npm start     # http://localhost:3000
cd frontend && npm install && npm run dev                          # http://localhost:5173
```

Sin `SUPABASE_URL`, el backend arranca con tres destinos de ejemplo en memoria (los datos se pierden al reiniciar).
Administrador de demostración: `admin@viajaya.test` / `Admin123!` (configurable en `.env`).

## Ejecución con persistencia (Supabase)

1. Cree un proyecto en https://supabase.com.
2. En **SQL Editor** ejecute `database/schema.sql` y, opcionalmente, `database/seed.sql`.
3. En **Authentication > Users** cree el usuario administrador y ejecute el `update auth.users ...` indicado al final de `schema.sql` para asignarle el rol `admin`.
4. Complete `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` y un `JWT_SECRET` largo y aleatorio.
5. `npm start` en `backend/`. La clave `SUPABASE_SERVICE_KEY` **nunca** debe ir en el frontend ni en el repositorio.

## Pruebas unitarias

```bash
cd backend
npm test                # 56 pruebas
npm run test:coverage   # con informe de cobertura
```

| Grupo | Archivo | Pruebas |
|---|---|---|
| RN-01 a RN-04 | `tests/reglas-negocio.test.js` | 23 |
| RF-01 a RF-06 | `tests/requerimientos-funcionales.test.js` | 20 |
| API HTTP, seguridad, RF-07 a RF-09 | `tests/api-admin.test.js` | 13 |

## Despliegue en Render (un solo servicio)

- **Build Command:** `cd frontend && npm install && npm run build && cd ../backend && npm install`
- **Start Command:** `node backend/src/server.js`
- **Variables de entorno:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `JWT_SECRET`, `JWT_EXPIRES_IN`.

El backend sirve el frontend compilado (`frontend/dist`), por lo que no se necesita CORS ni un segundo servicio.
La guía completa de despliegue corresponde al Entregable 4.

## Decisiones de diseño relevantes

- **Reserva activa:** no cancelada y con fecha de viaje no pasada; ocupa cupo (incluso con pago Rechazado, hasta que se cancele).
- **RN-02** (más de 48 h) aplica solo a cambios iniciados por el cliente; el administrador no está sujeto a ella.
- **RN-01 atómica:** la verificación de cupo se repite dentro de una función SQL que bloquea la fila del destino, evitando sobrecupos con solicitudes simultáneas.
- **Datos de tarjeta:** nunca se almacena el número completo, solo los últimos 4 dígitos.
- **Consulta de reservas por POST:** el correo del cliente no viaja en la URL.
