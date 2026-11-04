import { useState } from 'react';
import Reservar from './components/Reservar.jsx';
import MiReserva from './components/MiReserva.jsx';
import Admin from './components/Admin.jsx';

const TABS = [
  { id: 'reservar', texto: 'Reservar' },
  { id: 'consulta', texto: 'Mi reserva' },
  { id: 'admin', texto: 'Administración' },
];

export default function App() {
  const [tab, setTab] = useState('reservar');
  return (
    <>
      <header className="cabecera">
        <div className="contenedor barra">
          <h1>ViajaYa</h1>
          <nav aria-label="Secciones">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'tab activo' : 'tab'} onClick={() => setTab(t.id)}>
                {t.texto}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="contenedor">
        {tab === 'reservar' && <Reservar />}
        {tab === 'consulta' && <MiReserva />}
        {tab === 'admin' && <Admin />}
      </main>
      <footer className="pie contenedor">ViajaYa · Sistema de reservas turísticas ·</footer>
    </>
  );
}
