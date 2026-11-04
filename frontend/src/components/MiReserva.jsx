import { useState } from 'react';
import { api, hoyISO } from '../api.js';
import { Detalle } from './Reservar.jsx';

export default function MiReserva() {
  const [form, setForm] = useState({ codigo: '', correo: '' });
  const [reserva, setReserva] = useState(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  async function ejecutar(fn) {
    setError(''); setMensaje('');
    try { await fn(); } catch (e) { setError(e.message); }
  }

  const consultar = (e) => {
    e.preventDefault();
    ejecutar(async () => { setReserva(await api.consultar(form)); });
  };

  const cambiarFecha = (e) => {
    e.preventDefault();
    ejecutar(async () => {
      setReserva(await api.cambiarFecha(reserva.codigo, { correo: form.correo, nuevaFecha }));
      setMensaje('La fecha de su reserva fue actualizada.');
      setNuevaFecha('');
    });
  };

  const cancelar = () => {
    if (!window.confirm('¿Seguro que desea cancelar la reserva? Esta acción libera su cupo.')) return;
    ejecutar(async () => {
      await api.cancelar(reserva.codigo, { correo: form.correo });
      setReserva(null);
      setMensaje('Su reserva fue cancelada y el cupo quedó liberado.');
    });
  };

  return (
    <>
      <section className="tarjeta">
        <h2>Consulte su reserva</h2>
        <form onSubmit={consultar} className="rejilla">
          <label>Código de confirmación
            <input placeholder="VY-XXXXXXXX" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
          </label>
          <label>Correo electrónico
            <input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} required />
          </label>
          <button>Buscar</button>
        </form>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {mensaje && <p className="ok" role="status">{mensaje}</p>}

      {reserva && (
        <section className="tarjeta">
          <h2>Reserva {reserva.codigo}</h2>
          <Detalle r={reserva} />
          <h3>Cambiar la fecha</h3>
          <form onSubmit={cambiarFecha} className="rejilla">
            <label>Nueva fecha
              <input type="date" min={hoyISO()} value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} required />
            </label>
            <button>Cambiar fecha</button>
          </form>
          <p className="nota">Solo se puede cambiar la fecha o cancelar si faltan más de 48 horas para el viaje y hay cupo en la nueva fecha.</p>
          <button className="peligro" onClick={cancelar}>Cancelar reserva</button>
        </section>
      )}
    </>
  );
}
