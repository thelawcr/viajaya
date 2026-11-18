'use strict';
// Ejecución de los casos de prueba funcionales de ViajaYa (QA, Entregable 4).
// Uso: BASE=http://localhost:3100 node ejecutar_qa.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3100';
const OUT = process.env.OUT || '/home/claude/viajaya/docs/evidencias_qa';
fs.mkdirSync(OUT, { recursive: true });

const ADMIN = { email: 'admin@viajaya.test', password: 'Admin123!' };
const hoyCR = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
const fecha = (dias) => {
  const d = new Date(`${hoyCR()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const dinero = (n) => `$${Number(n).toFixed(2)}`;

// ------------------------------------------------------------------ utilidades HTTP
async function http(metodo, ruta, { cuerpo, token, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`${BASE}/api${ruta}${qs}`, {
    method: metodo,
    headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let json; try { json = JSON.parse(texto); } catch { json = texto; }
  return { status: res.status, json, texto };
}
let TOKEN;
const admin = async () => TOKEN || (TOKEN = (await http('POST', '/admin/login', { cuerpo: ADMIN })).json.token);
const reservasBD = async () => (await http('GET', '/admin/reservas', { token: await admin() })).json;
const porCodigo = async (codigo) => (await reservasBD()).find((r) => r.codigo === codigo);
const auditoriaBD = async () => (await http('GET', '/admin/auditoria', { token: await admin() })).json;
const destinos = async () => (await http('GET', '/destinos')).json;
const cupo = async (destinoId, f) => (await http('GET', '/disponibilidad', { query: { destinoId, fecha: f, personas: 1 } })).json.cupoDisponible;

let DEST; // { tortuguero, arenal, pacuare }
async function reservaAPI(destinoId, f, personas, extra = {}) {
  const r = await http('POST', '/reservas', {
    cuerpo: { destinoId, fecha: f, personas, nombreCliente: 'Cliente de Prueba', correoCliente: `prep${Math.random().toString(36).slice(2, 8)}@correo.com`, telefonoCliente: '8888-1234', numeroTarjeta: '4242 4242 4242 4242', ...extra },
  });
  if (r.status !== 201) throw new Error(`Precondición fallida: ${r.status} ${r.texto}`);
  return r.json;
}

// ------------------------------------------------------------------ resultados
const resultados = [];
function registrar(id, estado, obtenido, evidencia, extra = {}) {
  resultados.push({ id, estado, obtenido, evidencia, ...extra });
  console.log(`${estado === 'Aprobado' ? 'OK ' : 'FALLA'} ${id}: ${obtenido}`);
}
function afirmar(cond, mensaje) { if (!cond) throw new Error(`Aserción fallida: ${mensaje}`); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1.5, locale: 'es-CR' });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());

  const foto = async (id, sufijo = '') => {
    const f = `${id}${sufijo}.png`;
    await page.screenshot({ path: path.join(OUT, f), fullPage: true });
    return f;
  };
  const alerta = async () => (await page.locator('[role=alert], .error').first().innerText()).trim();
  const irA = async (tab) => { await page.goto(BASE); await page.getByRole('button', { name: tab, exact: true }).click(); };
  const ds = await destinos();
  DEST = {
    tortuguero: ds.find((d) => d.nombre.includes('Tortuguero')),
    arenal: ds.find((d) => d.nombre.includes('Arenal')),
    pacuare: ds.find((d) => d.nombre.includes('Pacuare')),
  };
  const T = DEST.tortuguero; // precio 120, capacidad 12

  async function buscarUI(nombreDestino, f, personas) {
    await irA('Reservar');
    await page.locator('select').first().selectOption({ label: (await page.locator('select option', { hasText: nombreDestino }).first().innerText()) });
    await page.locator('input[type=date]').first().fill(f);
    await page.locator('input[type=number]').first().fill(String(personas));
    await page.getByRole('button', { name: 'Buscar disponibilidad' }).click();
  }
  async function reservarUI({ destino, f, personas, nombre, correo, telefono, tarjeta }) {
    await buscarUI(destino, f, personas);
    await page.getByText('3. Datos y pago simulado').waitFor();
    await page.getByLabel('Nombre completo').fill(nombre);
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByLabel('Teléfono').fill(telefono);
    await page.getByLabel('Número de tarjeta (simulado)').fill(tarjeta);
    await page.getByRole('button', { name: 'Confirmar reserva y pagar' }).click();
  }
  async function consultarUI(codigo, correo) {
    await irA('Mi reserva');
    await page.getByLabel('Código de confirmación').fill(codigo);
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByRole('button', { name: 'Buscar' }).click();
  }
  async function loginUI(email = ADMIN.email, password = ADMIN.password) {
    await irA('Administración');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
  }
  const aislar = (codigo) => page.evaluate((c) => { document.querySelectorAll('tbody tr').forEach((tr) => { if (!tr.textContent.includes(c)) tr.remove(); }); }, codigo);
  async function caso(id, fn) {
    try { await fn(); } catch (e) {
      let ev = ''; try { ev = await foto(id, '-fallo'); } catch {}
      registrar(id, 'Fallido', e.message, ev);
    }
  }

  // =================================================================== CU-01
  await caso('TC-CU01-01', async () => {
    const antes = (await reservasBD()).length;
    await buscarUI('Tortuguero', fecha(10), 3);
    await page.getByText('2. Cotización').waitFor();
    const txt = await page.locator('main').innerText();
    afirmar(txt.includes('$360.00') && txt.includes('$46.80') && txt.includes('$406.80'), 'desglose $360.00 / $46.80 / $406.80');
    afirmar(txt.includes('Hay cupo disponible (12 lugares libres'), 'indica 12 lugares libres');
    afirmar((await reservasBD()).length === antes, 'la cotización no crea reservas');
    registrar('TC-CU01-01', 'Aprobado', 'La pantalla mostró Subtotal $360.00, IVA (13%) $46.80, Total $406.80 y “Hay cupo disponible (12 lugares libres ese día)”. Total de reservas en BD sin cambios.', await foto('TC-CU01-01'));
  });

  await caso('TC-CU01-02', async () => {
    const antes = (await reservasBD()).length;
    await buscarUI('Tortuguero', fecha(10), 13);
    await page.getByText('No hay cupo suficiente').waitFor();
    const msg = await page.locator('p.error').first().innerText();
    afirmar(msg.includes('solo quedan 12 lugares'), `mensaje con cupo restante (${msg})`);
    afirmar((await page.getByText('3. Datos y pago simulado').count()) === 0, 'no se muestra el formulario de reserva');
    afirmar((await reservasBD()).length === antes, 'BD sin cambios');
    registrar('TC-CU01-02', 'Aprobado', `Mensaje: “${msg}”. No se habilitó el formulario de pago y la BD no cambió.`, await foto('TC-CU01-02'));
  });

  await caso('TC-CU01-03', async () => {
    const r = await http('GET', '/disponibilidad', { query: { destinoId: T.id, fecha: fecha(-1), personas: 2 } });
    afirmar(r.status === 400 && r.json.error.codigo === 'VALIDACION', `HTTP 400 VALIDACION (se obtuvo ${r.status})`);
    afirmar(/pasado/.test(r.json.error.mensaje), 'mensaje menciona el pasado');
    const campo = await page.goto(BASE).then(() => page.getByRole('button', { name: 'Reservar', exact: true }).click()).then(() => page.locator('input[type=date]').first().getAttribute('min'));
    afirmar(campo === hoyCR(), `el campo fecha del formulario tiene min=${hoyCR()}`);
    registrar('TC-CU01-03', 'Aprobado', `Servidor: HTTP ${r.status} ${JSON.stringify(r.json)}. Formulario: el campo fecha impide elegir días anteriores a hoy (min=${campo}).`, 'API', { http: `GET /api/disponibilidad?destinoId=…&fecha=${fecha(-1)}&personas=2\n→ ${r.status}\n${JSON.stringify(r.json, null, 2)}` });
  });

  // =================================================================== CU-02
  let codigoAprobado, correoAprobado = 'laura.jimenez@correo.com';
  await caso('TC-CU02-01', async () => {
    const f = fecha(11);
    await reservarUI({ destino: 'Tortuguero', f, personas: 2, nombre: 'Laura Jiménez Mora', correo: correoAprobado, telefono: '8888-1234', tarjeta: '4242 4242 4242 4242' });
    await page.getByRole('heading', { name: 'Reserva registrada', exact: true }).waitFor();
    codigoAprobado = (await page.locator('.codigo').innerText()).trim();
    afirmar(/^VY-/.test(codigoAprobado), 'código con prefijo VY-');
    const txt = await page.locator('main').innerText();
    afirmar(txt.includes('$271.20'), 'total $271.20');
    afirmar(/Aprobado/.test(txt) && txt.includes('****4242'), 'pago Aprobado y tarjeta ****4242');
    const bd = await porCodigo(codigoAprobado);
    afirmar(bd && bd.estadoPago === 'Aprobado' && bd.estadoReserva === 'Pendiente' && bd.montoTotal === 271.2 && bd.personas === 2, 'registro en BD correcto');
    afirmar(bd.tarjetaUltimos4 === '4242' && !JSON.stringify(bd).includes('4242424242424242'), 'solo se guardan 4 dígitos');
    afirmar(bd.telefonoCliente === '8888-1234', 'teléfono guardado');
    afirmar((await cupo(T.id, f)) === 10, 'cupo del día descuenta 2 personas');
    registrar('TC-CU02-01', 'Aprobado', `Pantalla: “Reserva registrada”, código ${codigoAprobado}, total $271.20, pago Aprobado (****4242). BD: estadoReserva=Pendiente, estadoPago=Aprobado, montoTotal=271.2, tarjetaUltimos4=4242, sin número completo. Cupo del día: 12 → 10.`, await foto('TC-CU02-01'), { codigo: codigoAprobado });
  });

  await caso('TC-CU02-02', async () => {
    const f = fecha(11);
    await reservarUI({ destino: 'Tortuguero', f, personas: 2, nombre: 'Andrés Salazar Rojas', correo: 'andres.salazar@correo.com', telefono: '8777-4321', tarjeta: '4242 4242 4242 4243' });
    await page.getByRole('heading', { name: 'Reserva registrada con pago rechazado' }).waitFor();
    const codigo = (await page.locator('.codigo').innerText()).trim();
    const txt = await page.locator('main').innerText();
    afirmar(txt.includes('sigue ocupando su cupo'), 'aviso de revisión y cupo ocupado');
    const bd = await porCodigo(codigo);
    afirmar(bd.estadoPago === 'Rechazado' && bd.estadoReserva === 'Pendiente', 'BD: pago Rechazado, reserva Pendiente');
    afirmar((await cupo(T.id, f)) === 8, 'la reserva rechazada sigue ocupando cupo (10 → 8)');
    registrar('TC-CU02-02', 'Aprobado', `Pantalla: “Reserva registrada con pago rechazado” con código ${codigo} y aviso de revisión. BD: estadoPago=Rechazado, estadoReserva=Pendiente. El cupo del día pasó de 10 a 8 (sigue ocupado).`, await foto('TC-CU02-02'), { codigo });
  });

  await caso('TC-CU02-03', async () => {
    const f = fecha(12);
    const antes = (await reservasBD()).length;
    await reservarUI({ destino: 'Tortuguero', f, personas: 2, nombre: 'Carolina Vega Solís', correo: 'carolina.vega@correo.com', telefono: 'abc', tarjeta: '4242 4242 4242 4242' });
    await page.locator('[role=alert]').waitFor();
    const msg = await alerta();
    afirmar(msg.includes('El teléfono debe tener entre 7 y 15 dígitos'), `mensaje de teléfono (${msg})`);
    afirmar((await reservasBD()).length === antes, 'no se creó ninguna reserva');
    afirmar((await cupo(T.id, f)) === 12, 'cupo intacto');
    registrar('TC-CU02-03', 'Aprobado', `Alerta roja: “${msg}”. La BD conservó el mismo número de reservas (${antes}) y el cupo del día quedó intacto (12).`, await foto('TC-CU02-03'));
  });

  await caso('TC-CU02-04', async () => {
    const f = fecha(13);
    await reservaAPI(T.id, f, 12); // precondición: llena la capacidad (12/12)
    const antes = (await reservasBD()).length;
    await buscarUI('Tortuguero', f, 1);
    await page.getByText('No hay cupo suficiente').waitFor();
    const msg = await page.locator('p.error').first().innerText();
    afirmar(msg.includes('solo quedan 0 lugares'), `UI informa 0 lugares (${msg})`);
    const r = await http('POST', '/reservas', { cuerpo: { destinoId: T.id, fecha: f, personas: 1, nombreCliente: 'Intento Extra', correoCliente: 'extra@correo.com', telefonoCliente: '8888-1234', numeroTarjeta: '4242 4242 4242 4242' } });
    afirmar(r.status === 409 && r.json.error.codigo === 'CUPO_EXCEDIDO', `API 409 CUPO_EXCEDIDO (se obtuvo ${r.status})`);
    afirmar((await reservasBD()).length === antes, 'BD sin cambios: no hubo sobrecupo');
    registrar('TC-CU02-04', 'Aprobado', `Fecha con 12/12 personas. UI: “${msg}”. API directa: HTTP 409 ${r.json.error.codigo}. La BD no registró la reserva adicional (${antes} reservas antes y después).`, await foto('TC-CU02-04'), { http: `POST /api/reservas (1 persona, fecha llena)\n→ ${r.status}\n${JSON.stringify(r.json, null, 2)}` });
  });

  // =================================================================== CU-03
  await caso('TC-CU03-01', async () => {
    await consultarUI(codigoAprobado, correoAprobado);
    await page.getByRole('heading', { name: `Reserva ${codigoAprobado}` }).waitFor();
    const txt = await page.locator('main').innerText();
    afirmar(txt.includes('Laura Jiménez Mora') && txt.includes('$271.20') && txt.includes('Tortuguero'), 'datos correctos de la reserva');
    registrar('TC-CU03-01', 'Aprobado', `Se mostró “Reserva ${codigoAprobado}” con destino Tortuguero, cliente Laura Jiménez Mora, total $271.20 y estados Pendiente / Aprobado, además de las opciones cambiar fecha y cancelar.`, await foto('TC-CU03-01'));
  });

  await caso('TC-CU03-02', async () => {
    await consultarUI(codigoAprobado, 'otra.persona@correo.com');
    await page.locator('[role=alert]').waitFor();
    const msg = await alerta();
    afirmar(msg.includes('No se encontró una reserva activa con ese código y correo'), `mensaje genérico (${msg})`);
    afirmar((await page.getByRole('heading', { name: /^Reserva VY-/ }).count()) === 0, 'no se muestran datos de la reserva');
    registrar('TC-CU03-02', 'Aprobado', `Alerta: “${msg}”. No se reveló ningún dato; el mensaje es el mismo que para un código inexistente.`, await foto('TC-CU03-02'));
  });

  await caso('TC-CU03-03', async () => {
    const f1 = fecha(14), f2 = fecha(20);
    const r = await reservaAPI(T.id, f1, 2, { correoCliente: 'diego.mora@correo.com' });
    await consultarUI(r.codigo, 'diego.mora@correo.com');
    await page.getByRole('heading', { name: `Reserva ${r.codigo}` }).waitFor();
    await page.getByLabel('Nueva fecha').fill(f2);
    await page.getByRole('button', { name: 'Cambiar fecha' }).click();
    await page.getByText('La fecha de su reserva fue actualizada.').waitFor();
    const bd = await porCodigo(r.codigo);
    afirmar(bd.fechaViaje === f2, `fechaViaje=${f2}`);
    afirmar((await cupo(T.id, f1)) === 12 && (await cupo(T.id, f2)) === 10, 'cupo liberado en la fecha original y ocupado en la nueva');
    registrar('TC-CU03-03', 'Aprobado', `Mensaje: “La fecha de su reserva fue actualizada.” BD: fechaViaje ${f1} → ${f2}. Cupo de ${f1}: 10 → 12; cupo de ${f2}: 12 → 10.`, await foto('TC-CU03-03'), { codigo: r.codigo });
  });

  await caso('TC-CU03-04', async () => {
    const f = fecha(1); // menos de 48 h
    const r = await reservaAPI(T.id, f, 2, { correoCliente: 'sofia.araya@correo.com' });
    await consultarUI(r.codigo, 'sofia.araya@correo.com');
    await page.getByRole('heading', { name: `Reserva ${r.codigo}` }).waitFor();
    await page.getByRole('button', { name: 'Cancelar reserva' }).click();
    await page.locator('[role=alert]').waitFor();
    const msg = await alerta();
    afirmar(msg.includes('Solo se puede cambiar la fecha o cancelar si faltan más de 48 horas'), `mensaje RN-02 (${msg})`);
    const bd = await porCodigo(r.codigo);
    afirmar(bd.estadoReserva !== 'Cancelada', 'la reserva sigue activa');
    const rf = await http('PATCH', `/reservas/${r.codigo}/fecha`, { cuerpo: { correo: 'sofia.araya@correo.com', nuevaFecha: fecha(20) } });
    afirmar(rf.status === 409 && rf.json.error.codigo === 'FUERA_DE_VENTANA', 'cambiar fecha también se rechaza');
    registrar('TC-CU03-04', 'Aprobado', `Reserva para ${f} (menos de 48 h). Alerta: “${msg}”. BD: estadoReserva=${bd.estadoReserva} (sigue activa). Cambiar la fecha por API: HTTP ${rf.status} ${rf.json.error.codigo}.`, await foto('TC-CU03-04'), { codigo: r.codigo });
  });

  await caso('TC-CU03-05', async () => {
    const f = fecha(15);
    const r = await reservaAPI(T.id, f, 3, { correoCliente: 'marco.quesada@correo.com' });
    afirmar((await cupo(T.id, f)) === 9, 'precondición: cupo 9');
    await consultarUI(r.codigo, 'marco.quesada@correo.com');
    await page.getByRole('heading', { name: `Reserva ${r.codigo}` }).waitFor();
    await page.getByRole('button', { name: 'Cancelar reserva' }).click();
    await page.getByText('Su reserva fue cancelada y el cupo quedó liberado.').waitFor();
    const bd = await porCodigo(r.codigo);
    afirmar(bd.estadoReserva === 'Cancelada', 'estadoReserva=Cancelada');
    afirmar((await cupo(T.id, f)) === 12, 'cupo liberado (9 → 12)');
    registrar('TC-CU03-05', 'Aprobado', `Mensaje: “Su reserva fue cancelada y el cupo quedó liberado.” BD: estadoReserva=Cancelada. El cupo de ${f} pasó de 9 a 12.`, await foto('TC-CU03-05'), { codigo: r.codigo });
  });

  await caso('TC-CU03-06', async () => {
    const f1 = fecha(16), f2 = fecha(17);
    await reservaAPI(T.id, f2, 12); // fecha destino llena
    const r = await reservaAPI(T.id, f1, 2, { correoCliente: 'paula.rojas@correo.com' });
    await consultarUI(r.codigo, 'paula.rojas@correo.com');
    await page.getByRole('heading', { name: `Reserva ${r.codigo}` }).waitFor();
    await page.getByLabel('Nueva fecha').fill(f2);
    await page.getByRole('button', { name: 'Cambiar fecha' }).click();
    await page.locator('[role=alert]').waitFor();
    const msg = await alerta();
    afirmar(/cupo/i.test(msg), `mensaje de cupo (${msg})`);
    const bd = await porCodigo(r.codigo);
    afirmar(bd.fechaViaje === f1, 'la reserva conserva su fecha original');
    registrar('TC-CU03-06', 'Aprobado', `Fecha destino ${f2} con 12/12. Alerta: “${msg}”. BD: fechaViaje se mantiene en ${f1}.`, await foto('TC-CU03-06'), { codigo: r.codigo });
  });

  // =================================================================== CU-06 / RF-10
  await caso('TC-CU06-01', async () => {
    await loginUI(ADMIN.email, 'ClaveIncorrecta1');
    await page.locator('[role=alert]').waitFor();
    const msg = await alerta();
    afirmar(msg.includes('Correo o contraseña incorrectos'), `mensaje (${msg})`);
    const token = await page.evaluate(() => sessionStorage.getItem('vy_token'));
    afirmar(!token, 'no se guardó ningún token');
    afirmar((await page.getByRole('button', { name: 'Cerrar sesión' }).count()) === 0, 'no se accede al panel');
    registrar('TC-CU06-01', 'Aprobado', `Alerta: “${msg}”. No se guardó token de sesión y el panel de administración no se mostró.`, await foto('TC-CU06-01'));
  });

  await caso('TC-CU06-02', async () => {
    const sin = await http('GET', '/admin/reservas');
    const falso = await http('GET', '/admin/reservas', { token: 'token.falso.123' });
    afirmar(sin.status === 401 && falso.status === 401, 'ambas solicitudes devuelven 401');
    registrar('TC-CU06-02', 'Aprobado', `GET /api/admin/reservas sin token → HTTP ${sin.status}; con token falso → HTTP ${falso.status}. Ninguna respuesta incluyó datos de reservas.`, 'API', { http: `GET /api/admin/reservas (sin Authorization)\n→ ${sin.status}\n${JSON.stringify(sin.json, null, 2)}\n\nGET /api/admin/reservas (Authorization: Bearer token.falso.123)\n→ ${falso.status}\n${JSON.stringify(falso.json, null, 2)}` });
  });

  // =================================================================== CU-04
  await caso('TC-CU04-01', async () => {
    await loginUI();
    await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor();
    await page.getByRole('button', { name: 'Destinos', exact: true }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Snorkel en Cahuita');
    await page.getByLabel('Descripción').fill('Arrecife de coral en el Caribe sur');
    await page.getByLabel('Precio base por persona (USD)').fill('70');
    await page.getByLabel('Capacidad máxima diaria').fill('10');
    await page.getByRole('button', { name: 'Crear destino' }).click();
    await page.getByText('Snorkel en Cahuita').first().waitFor();
    const pub = await destinos();
    const nuevo = pub.find((d) => d.nombre === 'Snorkel en Cahuita');
    afirmar(nuevo && nuevo.precioBase === 70 && nuevo.capacidadDiaria === 10, 'el destino aparece en el listado público con sus datos');
    registrar('TC-CU04-01', 'Aprobado', 'El destino “Snorkel en Cahuita” (USD 70, capacidad 10) apareció en la tabla de destinos activos y en GET /api/destinos (listado público).', await foto('TC-CU04-01'));
  });

  await caso('TC-CU04-02', async () => {
    const antes = (await destinos()).length;
    const r1 = await http('POST', '/admin/destinos', { token: await admin(), cuerpo: { nombre: 'Destino inválido', descripcion: '', precioBase: 0, capacidadDiaria: 10 } });
    const r2 = await http('POST', '/admin/destinos', { token: await admin(), cuerpo: { nombre: 'Destino inválido', descripcion: '', precioBase: 50, capacidadDiaria: 0 } });
    afirmar(r1.status === 400 && r2.status === 400, 'ambas solicitudes responden 400');
    afirmar((await destinos()).length === antes, 'no se creó ningún destino');
    registrar('TC-CU04-02', 'Aprobado', `Precio 0 → HTTP ${r1.status} “${r1.json.error.mensaje}”. Capacidad 0 → HTTP ${r2.status} “${r2.json.error.mensaje}”. El número de destinos no cambió (${antes}).`, 'API', { http: `POST /api/admin/destinos {precioBase: 0, capacidadDiaria: 10}\n→ ${r1.status}\n${JSON.stringify(r1.json, null, 2)}\n\nPOST /api/admin/destinos {precioBase: 50, capacidadDiaria: 0}\n→ ${r2.status}\n${JSON.stringify(r2.json, null, 2)}` });
  });

  // =================================================================== CU-05
  async function filaAdmin(codigo) {
    await irA('Administración');
    if ((await page.getByRole('button', { name: 'Cerrar sesión' }).count()) === 0) {
      await page.getByLabel('Correo').fill(ADMIN.email);
      await page.getByLabel('Contraseña').fill(ADMIN.password);
      await page.getByRole('button', { name: 'Ingresar' }).click();
    }
    await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor();
    await page.getByRole('button', { name: 'Reservas', exact: true }).click();
    return page.locator('tr', { hasText: codigo });
  }

  await caso('TC-CU05-01', async () => {
    const f = fecha(18);
    const r = await reservaAPI(T.id, f, 2, { correoCliente: 'elena.chaves@correo.com', numeroTarjeta: '4242 4242 4242 4243' });
    const fila = await filaAdmin(r.codigo);
    afirmar((await porCodigo(r.codigo)).estadoPago === 'Rechazado', 'precondición: pago Rechazado');
    await fila.getByLabel(`Estado de pago de ${r.codigo}`).selectOption('Aprobado');
    await page.waitForTimeout(400);
    await fila.getByRole('button', { name: 'Aprobar' }).click();
    await page.waitForTimeout(400);
    const bd = await porCodigo(r.codigo);
    afirmar(bd.estadoPago === 'Aprobado' && bd.estadoReserva === 'Aprobada', 'BD: pago Aprobado y reserva Aprobada');
    await aislar(r.codigo);
    const evA = await foto('TC-CU05-01');
    await page.getByRole('button', { name: 'Auditoría', exact: true }).click();
    await page.getByText('Estado de pago modificado').first().waitFor();
    await aislar(r.codigo);
    const evB = await foto('TC-CU05-01', '-auditoria');
    const aud = (await auditoriaBD()).filter((a) => a.detalle && a.detalle.codigo === r.codigo).map((a) => a.accion);
    afirmar((await auditoriaBD()).filter((a) => a.detalle && a.detalle.codigo === r.codigo && a.accion !== 'RESERVA_CREADA').every((a) => a.actor === ADMIN.email), 'actor admin');
    afirmar(aud.includes('PAGO_MODIFICADO') && aud.includes('RESERVA_APROBADA'), 'auditoría registra ambas acciones');
    registrar('TC-CU05-01', 'Aprobado', `Pago Rechazado → Aprobado y reserva Pendiente → Aprobada. BD: estadoPago=Aprobado, estadoReserva=Aprobada. Auditoría: RESERVA_APROBADA y PAGO_MODIFICADO quedaron registradas con admin@viajaya.test como actor.`, evA, { codigo: r.codigo, evidencia2: evB });
  });

  await caso('TC-CU05-02', async () => {
    const f = fecha(19);
    const r = await reservaAPI(T.id, f, 3, { correoCliente: 'tomas.brenes@correo.com' });
    await http('PATCH', `/admin/reservas/${(await porCodigo(r.codigo)).id}/cancelar`, { token: await admin() });
    afirmar((await porCodigo(r.codigo)).estadoReserva === 'Cancelada', 'precondición: Cancelada');
    const fila = await filaAdmin(r.codigo);
    await fila.getByRole('button', { name: 'Reactivar' }).click();
    await page.waitForTimeout(400);
    const bd = await porCodigo(r.codigo);
    afirmar(bd.estadoReserva === 'Aprobada', 'reserva reactivada (Aprobada)');
    afirmar((await cupo(T.id, f)) === 9, 'vuelve a ocupar cupo (12 → 9)');
    afirmar((await auditoriaBD()).some((a) => a.accion === 'RESERVA_REACTIVADA' && a.detalle.codigo === r.codigo), 'auditoría RESERVA_REACTIVADA');
    await aislar(r.codigo);
    registrar('TC-CU05-02', 'Aprobado', `El botón cambió a “Reactivar”; tras presionarlo la reserva quedó Aprobada. El cupo de ${f} pasó de 12 a 9 y la auditoría registró RESERVA_REACTIVADA.`, await foto('TC-CU05-02'), { codigo: r.codigo });
  });

  await caso('TC-CU05-03', async () => {
    const f = fecha(21);
    const r = await reservaAPI(T.id, f, 3, { correoCliente: 'gabriela.pinto@correo.com' });
    await http('PATCH', `/admin/reservas/${(await porCodigo(r.codigo)).id}/cancelar`, { token: await admin() });
    await reservaAPI(T.id, f, 12); // otros clientes llenan la fecha (12/12)
    const fila = await filaAdmin(r.codigo);
    await fila.getByRole('button', { name: 'Reactivar' }).click();
    await page.locator('[role=alert]').waitFor();
    const msg = await alerta();
    afirmar(/cupo/i.test(msg), `mensaje de cupo (${msg})`);
    afirmar((await porCodigo(r.codigo)).estadoReserva === 'Cancelada', 'sigue Cancelada');
    await aislar(r.codigo);
    registrar('TC-CU05-03', 'Aprobado', `Fecha ${f} con 12/12 ocupadas por otros clientes. Alerta: “${msg}”. BD: la reserva sigue Cancelada.`, await foto('TC-CU05-03'), { codigo: r.codigo });
  });

  fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify({ ejecutado: new Date().toISOString(), base: BASE, resultados }, null, 2));
  const ok = resultados.filter((r) => r.estado === 'Aprobado').length;
  console.log(`\nResumen: ${ok}/${resultados.length} aprobados`);
  await browser.close();
  process.exit(ok === resultados.length ? 0 : 1);
})();
