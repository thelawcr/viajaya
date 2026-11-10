-- =====================================================================
-- ViajaYa - Reservas de prueba (clientes y datos ficticios)
-- Requiere haber cargado antes database/seed_caribe_sur.sql.
-- Las fechas son relativas a HOY (current_date + N días), así que sirven
-- el día que se ejecute. Cálculo de montos según RN-03 (IVA 13 %) y estado
-- de pago según RN-04 (último dígito de la tarjeta: par = Aprobado,
-- impar = Rechazado). Se puede repetir sin duplicar (código único).
-- Casos útiles para la demostración:
--   * Isla Pirriplí en hoy+5: 12 de 12 personas (RN-01, sin cupo)
--   * Laguna de Gandoca en hoy+10: 8 de 10 (quedan 2 lugares)
--   * Barco Hundido en hoy+1: faltan menos de 48 h (RN-02: no se puede cambiar ni cancelar)
--   * Reservas Canceladas, Aprobadas, Pendientes y con pago Rechazado
-- Consulta de una reserva: código + correo (por ejemplo VY-DEMO0001 y ana.solano@correo.com).
-- =====================================================================
with datos (codigo, nombre, correo, telefono, destino, dias, personas, estado_reserva, tarjeta) as (
  values
  ('VY-DEMO0001', 'Ana Solano Vargas',    'ana.solano@correo.com',    '8811-0001', 'Parque Nacional Cahuita',        7,  4, 'Aprobada',  '4242'),
  ('VY-DEMO0002', 'Luis Mora Jiménez',    'luis.mora@correo.com',     '8811-0002', 'Parque Nacional Cahuita',        7,  3, 'Pendiente', '1234'),
  ('VY-DEMO0003', 'Karla Rojas Brenes',   'karla.rojas@correo.com',   '8811-0003', 'Parque Nacional Cahuita',       14,  2, 'Pendiente', '4243'),
  ('VY-DEMO0004', 'Mario Chaves Pérez',   'mario.chaves@correo.com',  '8811-0004', 'Isla Pirriplí',                  5,  6, 'Aprobada',  '0008'),
  ('VY-DEMO0005', 'Sofía Araya Campos',   'sofia.araya@correo.com',   '8811-0005', 'Isla Pirriplí',                  5,  6, 'Pendiente', '5550'),
  ('VY-DEMO0006', 'Diego Quesada Mena',   'diego.quesada@correo.com', '8811-0006', 'Laguna de Gandoca',             10,  4, 'Aprobada',  '6666'),
  ('VY-DEMO0007', 'Paula Vega Salas',     'paula.vega@correo.com',    '8811-0007', 'Laguna de Gandoca',             10,  4, 'Pendiente', '2222'),
  ('VY-DEMO0008', 'Esteban Cruz Mora',    'esteban.cruz@correo.com',  '8811-0008', 'Laguna de Gandoca',              3,  2, 'Pendiente', '4040'),
  ('VY-DEMO0009', 'Valeria Núñez Ortiz',  'valeria.nunez@correo.com', '8811-0009', 'Barco Hundido de Manzanillo',    1,  3, 'Pendiente', '7770'),
  ('VY-DEMO0010', 'Andrés Salas Rivera',  'andres.salas@correo.com',  '8811-0010', 'Barco Hundido de Manzanillo',   20,  2, 'Cancelada', '8888'),
  ('VY-DEMO0011', 'Camila Díaz Herrera',  'camila.diaz@correo.com',   '8811-0011', 'Sendero de Cocles',              9,  5, 'Aprobada',  '1010'),
  ('VY-DEMO0012', 'Jorge Barrantes Ruiz', 'jorge.barrantes@correo.com','8811-0012','Sendero de Cocles',              9,  4, 'Pendiente', '1111'),
  ('VY-DEMO0013', 'Daniela Fonseca Lara', 'daniela.fonseca@correo.com','8811-0013','Cueva de Punta Uva',            12,  6, 'Pendiente', '3000'),
  ('VY-DEMO0014', 'Ricardo Alfaro Soto',  'ricardo.alfaro@correo.com','8811-0014', 'Muelle de Cahuita',              6, 10, 'Aprobada',  '2468'),
  ('VY-DEMO0015', 'Natalia Pacheco Gómez','natalia.pacheco@correo.com','8811-0015','Lanchón de Puerto Viejo',        8,  2, 'Pendiente', '9876'),
  ('VY-DEMO0016', 'Felipe Montero Arce',  'felipe.montero@correo.com','8811-0016', 'Mirador del Refugio Gandoca-Manzanillo', 15, 8, 'Aprobada', '4580'),
  ('VY-DEMO0017', 'Lucía Castro Bonilla', 'lucia.castro@correo.com',  '8811-0017', 'Casa de la Cultura Walter Ferguson', 4, 3, 'Cancelada', '7777')
)
insert into public.reservas
  (codigo, destino_id, fecha_viaje, personas, nombre_cliente, correo_cliente, telefono_cliente,
   monto_subtotal, monto_iva, monto_total, estado_reserva, estado_pago, tarjeta_ultimos4)
select d.codigo, t.id, current_date + d.dias, d.personas, d.nombre, d.correo, d.telefono,
       round(t.precio_base * d.personas, 2),
       round(t.precio_base * d.personas * 0.13, 2),
       round(t.precio_base * d.personas, 2) + round(t.precio_base * d.personas * 0.13, 2),
       d.estado_reserva,
       case when right(d.tarjeta, 1)::int % 2 = 0 then 'Aprobado' else 'Rechazado' end,
       d.tarjeta
from datos d
join public.destinos t on t.nombre = d.destino
on conflict (codigo) do nothing;
