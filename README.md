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
└── docs/               API Docs, Diagramas, Trazabilidad (.docx) y docs/diagramas (PNG + fuentes .mmd)
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
3. Si ya había ejecutado una versión anterior de `schema.sql`, ejecute también, en este orden, `database/migracion_auditoria.sql` (tabla de auditoría) y `database/migracion_e3_final.sql` (teléfono del cliente y reactivación de reservas).
4. En **Authentication > Users** cree el usuario administrador y ejecute el `update auth.users ...` indicado al final de `schema.sql` para asignarle el rol `admin`.
5. Complete `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` y un `JWT_SECRET` largo y aleatorio.
6. `npm start` en `backend/`. La clave `SUPABASE_SERVICE_KEY` **nunca** debe ir en el frontend ni en el repositorio.

## Despliegue en la nube (Render + Supabase)

El repositorio incluye `render.yaml` (Blueprint de Render, un solo servicio con API y frontend) y `.node-version`. En producción el servidor valida la configuración: sin `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` o con un `JWT_SECRET` de menos de 32 caracteres no arranca. La guía completa está en `docs/Plan_de_Despliegue_ViajaYa.docx`.

## Pruebas de aceptación (QA)

`docs/Plan_y_Casos_de_Prueba_ViajaYa.docx` documenta 20 casos funcionales; `docs/evidencias_qa/ejecutar_qa.js` los ejecuta con Playwright y guarda capturas y `resultados.json`.

## Pruebas unitarias

```bash
cd backend
npm test                # 87 pruebas
npm run test:coverage   # con informe de cobertura
```

| Grupo | Archivo | Pruebas |
|---|---|---|
| RN-01 a RN-04 | `tests/reglas-negocio.test.js` | 23 |
| RF-01 a RF-06 | `tests/requerimientos-funcionales.test.js` | 20 |
| API HTTP, seguridad, RF-07 a RF-09 | `tests/api-admin.test.js` | 13 |
| Auditoría (trazabilidad) | `tests/auditoria.test.js` | 12 |
| Casos de uso del SRS (CU-01, CU-02, CU-05, RF-10) | `tests/casos-de-uso.test.js` | 15 |

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

## Auditoría

Cada acción del administrador y de los clientes (crear, aprobar, cancelar, eliminar, cambiar pago o fecha, editar destinos) se guarda en la tabla `auditoria`, que es de solo agregar. Se consulta en **Administración > Auditoría** o con `GET /api/admin/auditoria`.

## Documentación

- `docs/API_Docs_ViajaYa.docx`: endpoints, reglas de negocio, errores y pruebas.
- `docs/Trazabilidad_ViajaYa.docx`: matriz entre SRS/SAD (E2) y la aplicación, y cambios respecto al E2.
- `docs/Diagramas_ViajaYa.docx`: DER, componentes y secuencia (fuentes editables en `docs/diagramas/*.mmd`).
