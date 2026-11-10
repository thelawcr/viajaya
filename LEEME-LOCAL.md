# ViajaYa: ejecución local rápida

Requisitos: Node.js 22 y npm.

## Backend (API) y pruebas
    cd backend
    npm install
    copy .env.example .env      (en PowerShell: Copy-Item .env.example .env)
    npm test                    (87 pruebas)
    npm start                   (http://localhost:3000, modo demostración si .env no tiene Supabase)

Administrador de demostración: admin@viajaya.test / Admin123!
Para usar Supabase, complete SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY y JWT_SECRET en backend/.env.

## Frontend en desarrollo (otra terminal)
    cd frontend
    npm install
    npm run dev                 (http://localhost:5173)

## Frontend servido por el backend (como en la nube)
    cd frontend
    npm run build               (crea frontend/dist)
    cd ../backend
    npm start                   (abra http://localhost:3000)

El archivo .env no se incluye (contiene secretos): use su propio .env.
