// Cliente HTTP de la API de ViajaYa. VITE_API_URL permite apuntar a otro host.
const BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(mensaje, codigo, status) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
  }
}

async function pedir(ruta, { metodo = 'GET', cuerpo, token, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`${BASE}/api${ruta}${qs}`, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(datos?.error?.mensaje || 'Error inesperado', datos?.error?.codigo, res.status);
  }
  return datos;
}

export const api = {
  destinos: () => pedir('/destinos'),
  disponibilidad: (q) => pedir('/disponibilidad', { query: q }),
  crearReserva: (cuerpo) => pedir('/reservas', { metodo: 'POST', cuerpo }),
  consultar: (cuerpo) => pedir('/reservas/consulta', { metodo: 'POST', cuerpo }),
  cambiarFecha: (codigo, cuerpo) => pedir(`/reservas/${encodeURIComponent(codigo)}/fecha`, { metodo: 'PATCH', cuerpo }),
  cancelar: (codigo, cuerpo) => pedir(`/reservas/${encodeURIComponent(codigo)}/cancelar`, { metodo: 'POST', cuerpo }),

  login: (cuerpo) => pedir('/admin/login', { metodo: 'POST', cuerpo }),
  admin: {
    destinos: (t) => pedir('/admin/destinos', { token: t }),
    crearDestino: (t, cuerpo) => pedir('/admin/destinos', { metodo: 'POST', cuerpo, token: t }),
    editarDestino: (t, id, cuerpo) => pedir(`/admin/destinos/${id}`, { metodo: 'PUT', cuerpo, token: t }),
    desactivar: (t, id) => pedir(`/admin/destinos/${id}/desactivar`, { metodo: 'PATCH', token: t }),
    activar: (t, id) => pedir(`/admin/destinos/${id}/activar`, { metodo: 'PATCH', token: t }),
    reservas: (t) => pedir('/admin/reservas', { token: t }),
    aprobar: (t, id) => pedir(`/admin/reservas/${id}/aprobar`, { metodo: 'PATCH', token: t }),
    cancelar: (t, id) => pedir(`/admin/reservas/${id}/cancelar`, { metodo: 'PATCH', token: t }),
    eliminar: (t, id) => pedir(`/admin/reservas/${id}`, { metodo: 'DELETE', token: t }),
    auditoria: (t) => pedir('/admin/auditoria', { token: t }),
    pago: (t, id, estadoPago) => pedir(`/admin/reservas/${id}/pago`, { metodo: 'PATCH', cuerpo: { estadoPago }, token: t }),
  },
};

export const dinero = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
export const hoyISO = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
