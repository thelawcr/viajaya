import { useEffect, useState } from 'react';
import { api, dinero, hoyISO } from '../api.js';

export default function Reservar() {
  const [destinos, setDestinos] = useState([]);
  const [busqueda, setBusqueda] = useState({ destinoId: '', fecha: '', personas: 2 });
  const [resultado, setResultado] = useState(null); // RF-01 + RF-02
  const [cliente, setCliente] = useState({ nombreCliente: '', correoCliente: '', numeroTarjeta: '' });
  const [confirmada, setConfirmada] = useState(null); // RF-03
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.destinos().then((d) => {
      setDestinos(d);
      if (d[0]) setBusqueda((b) => ({ ...b, destinoId: d[0].id }));
    }).catch((e) => setError(e.message));
  }, []);

  async function buscar(e) {
    e.preventDefault();
    setError(''); setResultado(null); setConfirmada(null); setCargando(true);
    try {
      setResultado(await api.disponibilidad({ ...busqueda, personas: Number(busqueda.personas) }));
    } catch (err) { setError(err.message); } finally { setCargando(false); }
  }

  async function reservar(e) {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      setConfirmada(await api.crearReserva({
        destinoId: busqueda.destinoId, fecha: busqueda.fecha, personas: Number(busqueda.personas), ...cliente,
      }));
      setResultado(null);
    } catch (err) { setError(err.message); } finally { setCargando(false); }
  }

  if (confirmada) {
    const ok = confirmada.estadoPago === 'Aprobado';
    return (
      <section className="tarjeta">
        <h2>{ok ? 'Reserva registrada' : 'Reserva registrada con pago rechazado'}</h2>
        <p className="codigo" aria-label="Código de confirmación">{confirmada.codigo}</p>
        <p>Guarde este código y su correo: los necesitará para consultar, cambiar la fecha o cancelar.</p>
        <Detalle r={confirmada} />
        {!ok && <p className="alerta">El gateway simulado rechazó el pago. La reserva queda pendiente y la agencia podrá revisarla.</p>}
        <button onClick={() => { setConfirmada(null); setCliente({ nombreCliente: '', correoCliente: '', numeroTarjeta: '' }); }}>Hacer otra reserva</button>
      </section>
    );
  }

  return (
    <>
      <section className="tarjeta">
        <h2>1. Busque su excursión</h2>
        <form onSubmit={buscar} className="rejilla">
          <label>Destino
            <select value={busqueda.destinoId} onChange={(e) => setBusqueda({ ...busqueda, destinoId: e.target.value })} required>
              {destinos.map((d) => <option key={d.id} value={d.id}>{d.nombre} — {dinero(d.precioBase)} por persona</option>)}
            </select>
          </label>
          <label>Fecha del viaje
            <input type="date" min={hoyISO()} value={busqueda.fecha} onChange={(e) => setBusqueda({ ...busqueda, fecha: e.target.value })} required />
          </label>
          <label>Personas
            <input type="number" min="1" max="50" value={busqueda.personas} onChange={(e) => setBusqueda({ ...busqueda, personas: e.target.value })} required />
          </label>
          <button disabled={cargando}>Buscar disponibilidad</button>
        </form>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      {resultado && (
        <section className="tarjeta">
          <h2>2. Cotización</h2>
          <p><strong>{resultado.destino.nombre}</strong> · {resultado.fecha} · {resultado.personas} persona(s)</p>
          <table className="tabla">
            <tbody>
              <tr><td>Subtotal ({resultado.personas} × {dinero(resultado.cotizacion.precioBase)})</td><td className="der">{dinero(resultado.cotizacion.subtotal)}</td></tr>
              <tr><td>IVA (13%)</td><td className="der">{dinero(resultado.cotizacion.iva)}</td></tr>
              <tr className="total"><td>Total</td><td className="der">{dinero(resultado.cotizacion.total)}</td></tr>
            </tbody>
          </table>
          {resultado.disponible ? (
            <>
              <p className="ok">Hay cupo disponible ({resultado.cupoDisponible} lugares libres ese día).</p>
              <h2>3. Datos y pago simulado</h2>
              <form onSubmit={reservar} className="rejilla">
                <label>Nombre completo
                  <input value={cliente.nombreCliente} onChange={(e) => setCliente({ ...cliente, nombreCliente: e.target.value })} required />
                </label>
                <label>Correo electrónico
                  <input type="email" value={cliente.correoCliente} onChange={(e) => setCliente({ ...cliente, correoCliente: e.target.value })} required />
                </label>
                <label>Número de tarjeta (simulado)
                  <input inputMode="numeric" placeholder="4242 4242 4242 4242" value={cliente.numeroTarjeta} onChange={(e) => setCliente({ ...cliente, numeroTarjeta: e.target.value })} required />
                </label>
                <button disabled={cargando}>Confirmar reserva y pagar</button>
              </form>
              <p className="nota">Gateway simulado: si la tarjeta termina en dígito par el pago se aprueba; si termina en impar, se rechaza.</p>
            </>
          ) : (
            <p className="error">No hay cupo suficiente: solo quedan {resultado.cupoDisponible} lugares para esa fecha. Pruebe otra fecha o menos personas.</p>
          )}
        </section>
      )}
    </>
  );
}

export function Detalle({ r }) {
  return (
    <table className="tabla">
      <tbody>
        <tr><td>Destino</td><td>{r.destino}</td></tr>
        <tr><td>Fecha del viaje</td><td>{r.fechaViaje}</td></tr>
        <tr><td>Personas</td><td>{r.personas}</td></tr>
        <tr><td>Cliente</td><td>{r.nombreCliente} ({r.correoCliente})</td></tr>
        <tr><td>Total (IVA incluido)</td><td>{dinero(r.total)}</td></tr>
        <tr><td>Estado de la reserva</td><td><span className={`etiqueta ${r.estadoReserva}`}>{r.estadoReserva}</span></td></tr>
        <tr><td>Estado del pago</td><td><span className={`etiqueta ${r.estadoPago}`}>{r.estadoPago}</span> (tarjeta ****{r.tarjetaUltimos4})</td></tr>
      </tbody>
    </table>
  );
}
