import { useCallback, useEffect, useState } from 'react';
import { api, dinero } from '../api.js';

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('vy_token') || '');
  const [vista, setVista] = useState('reservas');

  function salir() { sessionStorage.removeItem('vy_token'); setToken(''); }

  if (!token) return <Login onToken={(t) => { sessionStorage.setItem('vy_token', t); setToken(t); }} />;

  return (
    <>
      <div className="fila">
        <button className={vista === 'reservas' ? 'tab activo' : 'tab'} onClick={() => setVista('reservas')}>Reservas</button>
        <button className={vista === 'destinos' ? 'tab activo' : 'tab'} onClick={() => setVista('destinos')}>Destinos</button>
        <button className={vista === 'auditoria' ? 'tab activo' : 'tab'} onClick={() => setVista('auditoria')}>Auditoría</button>
        <span className="espacio" />
        <button className="secundario" onClick={salir}>Cerrar sesión</button>
      </div>
      {vista === 'reservas' && <Reservas token={token} onExpira={salir} />}
      {vista === 'destinos' && <Destinos token={token} onExpira={salir} />}
      {vista === 'auditoria' && <Auditoria token={token} onExpira={salir} />}
    </>
  );
}

function Login({ onToken }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  async function enviar(e) {
    e.preventDefault(); setError('');
    try { onToken((await api.login(f)).token); } catch (err) { setError(err.message); }
  }
  return (
    <section className="tarjeta angosta">
      <h2>Acceso de administración</h2>
      <form onSubmit={enviar} className="rejilla">
        <label>Correo<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label>Contraseña<input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
        <button>Ingresar</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

/** Hook: carga datos y cierra sesión si el token expiró. */
function useCarga(fn, onExpira) {
  const [datos, setDatos] = useState([]);
  const [error, setError] = useState('');
  const recargar = useCallback(async () => {
    try { setDatos(await fn()); setError(''); }
    catch (e) { if (e.status === 401) onExpira(); else setError(e.message); }
  }, [fn, onExpira]);
  useEffect(() => { recargar(); }, [recargar]);
  return { datos, error, setError, recargar };
}

function Reservas({ token, onExpira }) {
  const cargar = useCallback(() => api.admin.reservas(token), [token]);
  const { datos, error, setError, recargar } = useCarga(cargar, onExpira);

  async function accion(fn, confirmar) {
    if (confirmar && !window.confirm(confirmar)) return;
    try { await fn(); await recargar(); } catch (e) { if (e.status === 401) onExpira(); else setError(e.message); }
  }

  return (
    <section className="tarjeta">
      <h2>Gestión de reservas</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="scroll">
        <table className="tabla ancha">
          <thead><tr><th>Código</th><th>Destino</th><th>Fecha</th><th>Pers.</th><th>Cliente</th><th>Total</th><th>Reserva</th><th>Pago</th><th>Acciones</th></tr></thead>
          <tbody>
            {datos.length === 0 && <tr><td colSpan="9">No hay reservas registradas.</td></tr>}
            {datos.map((r) => (
              <tr key={r.id}>
                <td>{r.codigo}</td><td>{r.destinoNombre}</td><td>{r.fechaViaje}</td><td>{r.personas}</td>
                <td>{r.nombreCliente}<br /><small>{r.correoCliente}</small></td><td>{dinero(r.montoTotal)}</td>
                <td><span className={`etiqueta ${r.estadoReserva}`}>{r.estadoReserva}</span></td>
                <td>
                  <select aria-label={`Estado de pago de ${r.codigo}`} value={r.estadoPago}
                    onChange={(e) => accion(() => api.admin.pago(token, r.id, e.target.value))}>
                    <option>Pendiente</option><option>Aprobado</option><option>Rechazado</option>
                  </select>
                </td>
                <td className="acciones">
                  <button disabled={r.estadoReserva !== 'Pendiente'} onClick={() => accion(() => api.admin.aprobar(token, r.id))}>Aprobar</button>
                  <button className="secundario" disabled={r.estadoReserva === 'Cancelada'} onClick={() => accion(() => api.admin.cancelar(token, r.id), '¿Cancelar esta reserva?')}>Cancelar</button>
                  <button className="peligro" onClick={() => accion(() => api.admin.eliminar(token, r.id), '¿Eliminar definitivamente esta reserva?')}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const VACIO = { id: null, nombre: '', descripcion: '', precioBase: '', capacidadDiaria: '' };

function Destinos({ token, onExpira }) {
  const cargar = useCallback(() => api.admin.destinos(token), [token]);
  const { datos, error, setError, recargar } = useCarga(cargar, onExpira);
  const [form, setForm] = useState(VACIO);

  async function guardar(e) {
    e.preventDefault();
    const cuerpo = {
      nombre: form.nombre, descripcion: form.descripcion,
      precioBase: Number(form.precioBase), capacidadDiaria: Number(form.capacidadDiaria),
    };
    try {
      if (form.id) await api.admin.editarDestino(token, form.id, cuerpo); else await api.admin.crearDestino(token, cuerpo);
      setForm(VACIO); await recargar();
    } catch (err) { if (err.status === 401) onExpira(); else setError(err.message); }
  }

  async function alternar(d) {
    try { await (d.activo ? api.admin.desactivar(token, d.id) : api.admin.activar(token, d.id)); await recargar(); }
    catch (err) { setError(err.message); }
  }

  return (
    <>
      <section className="tarjeta">
        <h2>{form.id ? 'Editar destino' : 'Nuevo destino'}</h2>
        <form onSubmit={guardar} className="rejilla">
          <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
          <label>Descripción<input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></label>
          <label>Precio base por persona (USD)<input type="number" min="0.01" step="0.01" value={form.precioBase} onChange={(e) => setForm({ ...form, precioBase: e.target.value })} required /></label>
          <label>Capacidad máxima diaria<input type="number" min="1" step="1" value={form.capacidadDiaria} onChange={(e) => setForm({ ...form, capacidadDiaria: e.target.value })} required /></label>
          <div className="fila">
            <button>{form.id ? 'Guardar cambios' : 'Crear destino'}</button>
            {form.id && <button type="button" className="secundario" onClick={() => setForm(VACIO)}>Cancelar edición</button>}
          </div>
        </form>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="tarjeta">
        <h2>Destinos</h2>
        <table className="tabla ancha">
          <thead><tr><th>Nombre</th><th>Precio base</th><th>Capacidad diaria</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {datos.map((d) => (
              <tr key={d.id}>
                <td>{d.nombre}<br /><small>{d.descripcion}</small></td><td>{dinero(d.precioBase)}</td><td>{d.capacidadDiaria}</td>
                <td><span className={`etiqueta ${d.activo ? 'Aprobada' : 'Cancelada'}`}>{d.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td className="acciones">
                  <button className="secundario" onClick={() => setForm({ id: d.id, nombre: d.nombre, descripcion: d.descripcion, precioBase: d.precioBase, capacidadDiaria: d.capacidadDiaria })}>Editar</button>
                  <button className={d.activo ? 'peligro' : ''} onClick={() => alternar(d)}>{d.activo ? 'Desactivar' : 'Activar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

const ETIQUETAS = {
  RESERVA_CREADA: 'Reserva creada',
  RESERVA_FECHA_CAMBIADA: 'Fecha cambiada',
  RESERVA_CANCELADA_CLIENTE: 'Cancelada por el cliente',
  RESERVA_CANCELADA_ADMIN: 'Cancelada por la agencia',
  RESERVA_APROBADA: 'Reserva aprobada',
  RESERVA_ELIMINADA: 'Reserva eliminada',
  PAGO_MODIFICADO: 'Estado de pago modificado',
  DESTINO_CREADO: 'Destino creado',
  DESTINO_EDITADO: 'Destino editado',
  DESTINO_DESACTIVADO: 'Destino desactivado',
  DESTINO_ACTIVADO: 'Destino activado',
};

function describir(e) {
  const d = e.detalle || {};
  switch (e.accion) {
    case 'RESERVA_CREADA': return `${d.codigo} · ${d.destino} · ${d.fechaViaje} · ${d.personas} pers. · pago ${d.estadoPago}`;
    case 'RESERVA_FECHA_CAMBIADA': return `${d.codigo} · ${d.de} → ${d.a}`;
    case 'PAGO_MODIFICADO': return `${d.codigo} · ${d.de} → ${d.a}`;
    case 'RESERVA_ELIMINADA': return `${d.codigo} · ${d.fechaViaje} · ${d.personas} pers. · ${d.cliente}`;
    case 'DESTINO_EDITADO': return `${d.nombre} · ${Object.entries(d.cambios || {}).map(([k, c]) => `${k}: ${c.de} → ${c.a}`).join(', ')}`;
    case 'DESTINO_CREADO': return `${d.nombre} · ${d.precioBase} USD · capacidad ${d.capacidadDiaria}`;
    default: return d.codigo || d.nombre || '';
  }
}

function Auditoria({ token, onExpira }) {
  const cargar = useCallback(() => api.admin.auditoria(token), [token]);
  const { datos, error, recargar } = useCarga(cargar, onExpira);
  return (
    <section className="tarjeta">
      <div className="fila">
        <h2>Registro de auditoría</h2>
        <span className="espacio" />
        <button className="secundario" onClick={recargar}>Actualizar</button>
      </div>
      <p className="nota">Muestra quién realizó cada acción y cuándo. El registro es de solo lectura.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="scroll">
        <table className="tabla ancha">
          <thead><tr><th>Fecha y hora</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>
            {datos.length === 0 && <tr><td colSpan="4">Aún no hay acciones registradas.</td></tr>}
            {datos.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.createdAt).toLocaleString('es-CR')}</td>
                <td>{e.actor}</td>
                <td>{ETIQUETAS[e.accion] || e.accion}</td>
                <td>{describir(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
