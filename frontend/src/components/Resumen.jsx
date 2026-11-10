import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, dinero, hoyISO } from '../api.js';
import { FotoDestino } from '../imagenes.jsx';

/** Nombre legible a partir del correo del token: "denilson.rojas@x" -> "Denilson Rojas". */
function nombreDesdeToken(token) {
  try {
    const sub = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || '';
    return sub.split('@')[0].split(/[._-]/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join(' ') || 'administrador';
  } catch { return 'administrador'; }
}

const sumar = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' });
const suma = (iso, dias) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const COLORES = { Aprobada: '#198754', Pendiente: '#d99a1d', Cancelada: '#dc3545', Aprobado: '#198754', Rechazado: '#dc3545' };

function Kpi({ icono, titulo, valor, detalle, tono = 'azul' }) {
  return (
    <div className={`kpi kpi-${tono}`}>
      <span className="kpi-icono" aria-hidden="true">{icono}</span>
      <div>
        <div className="kpi-titulo">{titulo}</div>
        <div className="kpi-valor">{valor}</div>
        {detalle && <div className="kpi-detalle">{detalle}</div>}
      </div>
    </div>
  );
}

/** Dona hecha con conic-gradient: partes = [{nombre, valor, color}] */
function Dona({ partes, centro, etiquetaCentro }) {
  const total = sumar(partes, (p) => p.valor);
  let acum = 0;
  const tramos = total === 0 ? '#e3e9f1 0 100%' : partes.filter((p) => p.valor > 0).map((p) => {
    const ini = (acum / total) * 100; acum += p.valor; return `${p.color} ${ini}% ${(acum / total) * 100}%`;
  }).join(', ');
  return (
    <div className="dona-caja">
      <div className="dona" style={{ background: `conic-gradient(${tramos})` }} role="img"
        aria-label={partes.map((p) => `${p.nombre}: ${p.valor}`).join(', ')}>
        <div className="dona-centro"><strong>{centro}</strong><small>{etiquetaCentro}</small></div>
      </div>
      <ul className="leyenda">
        {partes.map((p) => (
          <li key={p.nombre}><i style={{ background: p.color }} />{p.nombre}<b>{p.valor}</b></li>
        ))}
      </ul>
    </div>
  );
}

export default function Resumen({ token, onExpira }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    try {
      const [reservas, destinos, auditoria] = await Promise.all([api.admin.reservas(token), api.admin.destinos(token), api.admin.auditoria(token)]);
      setD({ reservas, destinos, auditoria }); setError('');
    } catch (e) { if (e.status === 401) onExpira(); else setError(e.message); }
  }, [token, onExpira]);
  useEffect(() => { cargar(); }, [cargar]);

  const m = useMemo(() => {
    if (!d) return null;
    const hoy = hoyISO();
    const activas = d.reservas.filter((r) => r.estadoReserva !== 'Cancelada');
    const cobradas = activas.filter((r) => r.estadoPago === 'Aprobado');
    const porCobrar = activas.filter((r) => r.estadoPago !== 'Aprobado');
    const futuras = activas.filter((r) => r.fechaViaje >= hoy);
    const estados = ['Aprobada', 'Pendiente', 'Cancelada'].map((n) => ({ nombre: n, valor: d.reservas.filter((r) => r.estadoReserva === n).length, color: COLORES[n] }));
    const pagos = ['Aprobado', 'Pendiente', 'Rechazado'].map((n) => ({ nombre: n, valor: activas.filter((r) => r.estadoPago === n).length, color: n === 'Pendiente' ? '#d99a1d' : COLORES[n] }));
    const porDestino = d.destinos.map((x) => {
      const rs = activas.filter((r) => r.destinoId === x.id);
      return { ...x, reservas: rs.length, personas: sumar(rs, (r) => r.personas), ingresos: sumar(rs.filter((r) => r.estadoPago === 'Aprobado'), (r) => r.montoTotal) };
    }).sort((a, b) => b.ingresos - a.ingresos || b.reservas - a.reservas);
    const dias = Array.from({ length: 14 }, (_, i) => {
      const f = suma(hoy, i);
      return { f, personas: sumar(activas.filter((r) => r.fechaViaje === f), (r) => r.personas) };
    });
    const llenas = [];
    const mapa = {};
    futuras.forEach((r) => { const k = `${r.destinoId}|${r.fechaViaje}`; mapa[k] = (mapa[k] || 0) + r.personas; });
    Object.entries(mapa).forEach(([k, p]) => {
      const [id, f] = k.split('|'); const x = d.destinos.find((y) => y.id === id);
      if (x && p / x.capacidadDiaria >= 0.75) llenas.push({ nombre: x.nombre, f, p, cap: x.capacidadDiaria, pct: Math.round((p / x.capacidadDiaria) * 100) });
    });
    llenas.sort((a, b) => b.pct - a.pct || a.f.localeCompare(b.f));
    const proximas = [...futuras].sort((a, b) => a.fechaViaje.localeCompare(b.fechaViaje)).slice(0, 6);
    const admins = {};
    d.auditoria.filter((a) => !String(a.actor).startsWith('cliente:')).forEach((a) => {
      const x = admins[a.actor] || (admins[a.actor] = { actor: a.actor, acciones: 0, ultima: a.createdAt });
      x.acciones += 1; if (a.createdAt > x.ultima) x.ultima = a.createdAt;
    });
    return {
      hoy, activas, cobradas, porCobrar, futuras, estados, pagos, porDestino, dias, llenas, proximas,
      admins: Object.values(admins).sort((a, b) => b.acciones - a.acciones),
      recientes: d.auditoria.slice(0, 6),
      ingresos: sumar(cobradas, (r) => r.montoTotal),
      porCobrarMonto: sumar(porCobrar, (r) => r.montoTotal),
      pendientesAprobar: activas.filter((r) => r.estadoReserva === 'Pendiente').length,
      personasFuturas: sumar(futuras, (r) => r.personas),
    };
  }, [d]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!m) return <section className="tarjeta"><p className="nota">Cargando el resumen…</p></section>;
  const maxIng = Math.max(1, ...m.porDestino.map((x) => x.ingresos));
  const maxDia = Math.max(1, ...m.dias.map((x) => x.personas));
  const hoyTxt = new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="panel">
      <section className="bienvenida">
        <div>
          <h2>Hola, {nombreDesdeToken(token)}</h2>
          <p>Resumen de la agencia · <span className="cap">{hoyTxt}</span></p>
        </div>
        <button className="secundario" onClick={cargar}>Actualizar datos</button>
      </section>

      <div className="kpis">
        <Kpi icono="🎫" titulo="Reservas activas" valor={m.activas.length} detalle={`${m.estados[2].valor} ${m.estados[2].valor === 1 ? 'cancelada' : 'canceladas'}`} />
        <Kpi icono="💵" titulo="Ingresos cobrados" valor={dinero(m.ingresos)} detalle="pagos aprobados" tono="verde" />
        <Kpi icono="⏳" titulo="Por cobrar" valor={dinero(m.porCobrarMonto)} detalle={`${m.porCobrar.length} con pago pendiente o rechazado`} tono="ambar" />
        <Kpi icono="📝" titulo="Por aprobar" valor={m.pendientesAprobar} detalle="reservas pendientes" tono="ambar" />
        <Kpi icono="🧳" titulo="Viajeros próximos" valor={m.personasFuturas} detalle={`en ${m.futuras.length} ${m.futuras.length === 1 ? 'reserva por venir' : 'reservas por venir'}`} />
        <Kpi icono="🗺️" titulo="Destinos activos" valor={m.porDestino.filter((x) => x.activo).length} detalle={`de ${m.porDestino.length} registrados`} />
      </div>

      <div className="panel-dos">
        <section className="tarjeta">
          <h3>Estado de las reservas</h3>
          <Dona partes={m.estados} centro={d.reservas.length} etiquetaCentro="en total" />
        </section>
        <section className="tarjeta">
          <h3>Estado del pago (reservas activas)</h3>
          <Dona partes={m.pagos} centro={m.activas.length} etiquetaCentro="activas" />
        </section>
      </div>

      <section className="tarjeta">
        <h3>Viajeros por día · próximos 14 días</h3>
        <div className="barras-dia" role="img" aria-label="Personas por día en los próximos 14 días">
          {m.dias.map((x) => (
            <div key={x.f} className="col-dia" title={`${fechaCorta(x.f)}: ${x.personas} personas`}>
              <span className="col-valor">{x.personas || ''}</span>
              <div className="col-barra"><div style={{ height: `${(x.personas / maxDia) * 100}%` }} /></div>
              <span className="col-fecha">{fechaCorta(x.f)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="tarjeta">
        <h3>Destinos</h3>
        <div className="destinos-grid">
          {m.porDestino.map((x) => (
            <article key={x.id} className={x.activo ? 'destino-card' : 'destino-card inactivo'}>
              <FotoDestino nombre={x.nombre} className="destino-card-foto" />
              <header><strong>{x.nombre}</strong><span className={`etiqueta ${x.activo ? 'Aprobada' : 'Cancelada'}`}>{x.activo ? 'Activo' : 'Inactivo'}</span></header>
              <p className="destino-datos">{dinero(x.precioBase)} por persona · cupo {x.capacidadDiaria} por día</p>
              <div className="barra-h"><div style={{ width: `${(x.ingresos / maxIng) * 100}%` }} /></div>
              <div className="destino-cifras">
                <span><b>{x.reservas}</b> reservas</span>
                <span><b>{x.personas}</b> personas</span>
                <span><b>{dinero(x.ingresos)}</b> cobrado</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="panel-dos">
        <section className="tarjeta">
          <h3>Fechas con poco cupo</h3>
          {m.llenas.length === 0 ? <p className="nota">Ninguna fecha próxima supera el 75 % de ocupación.</p> : (
            <ul className="lista-llenas">
              {m.llenas.slice(0, 6).map((x) => (
                <li key={x.nombre + x.f}>
                  <div className="llena-top"><span>{x.nombre}</span><b>{fechaCorta(x.f)}</b></div>
                  <div className="barra-h ocup"><div className={x.pct >= 100 ? 'lleno' : ''} style={{ width: `${Math.min(100, x.pct)}%` }} /></div>
                  <small>{x.p} de {x.cap} personas · {x.pct >= 100 ? 'sin cupo' : `${x.pct} % ocupado`}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="tarjeta">
          <h3>Próximas salidas</h3>
          {m.proximas.length === 0 ? <p className="nota">No hay salidas próximas.</p> : (
            <ul className="lista-salidas">
              {m.proximas.map((r) => (
                <li key={r.id}>
                  <span className="fecha-chip">{fechaCorta(r.fechaViaje)}</span>
                  <div><strong>{r.destinoNombre}</strong><small>{r.nombreCliente} · {r.personas} pers.</small></div>
                  <span className={`etiqueta ${r.estadoReserva}`}>{r.estadoReserva}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="panel-dos">
        <section className="tarjeta">
          <h3>Actividad por administrador</h3>
          {m.admins.length === 0 ? <p className="nota">Aún no hay acciones de administradores.</p> : (
            <ul className="lista-admins">
              {m.admins.map((a) => (
                <li key={a.actor}>
                  <span className="avatar" aria-hidden="true">{a.actor[0].toUpperCase()}</span>
                  <div><strong>{a.actor}</strong><small>Última acción: {new Date(a.ultima).toLocaleString('es-CR')}</small></div>
                  <b className="acc-total">{a.acciones}<small> acciones</small></b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="tarjeta">
          <h3>Actividad reciente</h3>
          {m.recientes.length === 0 ? <p className="nota">Sin actividad registrada.</p> : (
            <ul className="lista-recientes">
              {m.recientes.map((a) => (
                <li key={a.id}>
                  <span className="punto" />
                  <div><span>{ETIQ[a.accion] || a.accion}</span><small>{a.actor} · {new Date(a.createdAt).toLocaleString('es-CR')}</small></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const ETIQ = {
  RESERVA_CREADA: 'Reserva creada', RESERVA_FECHA_CAMBIADA: 'Fecha cambiada', RESERVA_CANCELADA_CLIENTE: 'Cancelada por el cliente',
  RESERVA_CANCELADA_ADMIN: 'Cancelada por la agencia', RESERVA_APROBADA: 'Reserva aprobada', RESERVA_REACTIVADA: 'Reserva reactivada',
  RESERVA_ELIMINADA: 'Reserva eliminada', PAGO_MODIFICADO: 'Estado de pago modificado', DESTINO_CREADO: 'Destino creado',
  DESTINO_EDITADO: 'Destino editado', DESTINO_DESACTIVADO: 'Destino desactivado', DESTINO_ACTIVADO: 'Destino activado',
};
