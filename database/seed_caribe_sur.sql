-- =====================================================================
-- ViajaYa - Datos de prueba: destinos del Caribe Sur de Costa Rica
-- Fuente de los nombres y zonas: https://ruta-caribe-sur.vercel.app/
-- Los precios (USD por persona) y las capacidades diarias son VALORES
-- DE EJEMPLO inventados para pruebas: la página no publica tarifas.
-- Ejecutar en Supabase > SQL Editor. Se puede repetir sin duplicar
-- (omite los destinos cuyo nombre ya existe).
-- Para empezar de cero: delete from public.reservas; delete from public.destinos;
-- (la tabla auditoria es de solo agregar y no se puede vaciar).
-- =====================================================================
insert into public.destinos (nombre, descripcion, precio_base, capacidad_diaria)
select v.nombre, v.descripcion, v.precio, v.capacidad
from (values
  -- Zona 1: Cahuita
  ('Muelle de Cahuita',                         'Cahuita: pueblo de pescadores con arrecife de coral y música calipso. Recorrido por el muelle y su entorno.',                 15.00, 25),
  ('Casa de la Cultura Walter Ferguson',        'Cahuita: visita cultural a la casa dedicada al legado del calipso afrocaribeño.',                                            10.00, 20),
  ('Puerto Vargas',                             'Cahuita: sector del Parque Nacional con acceso a playa y senderos.',                                                         18.00, 30),
  ('Parque Nacional Cahuita',                   'Cahuita: caminata por el parque nacional junto al arrecife de coral.',                                                       25.00, 30),
  -- Zona 2: Puerto Viejo y Cocles
  ('Lanchón de Puerto Viejo',                   'Puerto Viejo: paseo por el corazón afrocaribeño de la ruta, con playas y la vida del pueblo.',                               12.00, 20),
  ('Casa de la Cultura Marcus Garvey',          'Puerto Viejo: visita cultural a la casa dedicada a Marcus Garvey.',                                                          10.00, 20),
  ('Sendero de Cocles',                         'Cocles: caminata por los senderos y playas de la zona.',                                                                     20.00, 15),
  ('Isla Pirriplí',                             'Puerto Viejo y Cocles: excursión a la isla Pirriplí.',                                                                       35.00, 12),
  -- Zona 3: Punta Uva, Manzanillo y Gandoca
  ('Cueva de Punta Uva',                        'Punta Uva: visita a la cueva y a la playa de la zona.',                                                                      22.00, 15),
  ('Barco Hundido de Manzanillo',               'Manzanillo: visita al barco hundido, atractivo de la costa.',                                                                28.00, 12),
  ('Iglesia Bautista de Manzanillo',            'Manzanillo: visita a la iglesia bautista, parte de la herencia de las comunidades costeras.',                                10.00, 20),
  ('Mirador del Refugio Gandoca-Manzanillo',    'Refugio Gandoca-Manzanillo: mirador con vista del refugio de vida silvestre.',                                               30.00, 15),
  ('Laguna de Gandoca',                         'Gandoca: recorrido por la laguna, cerca de la frontera con Panamá.',                                                         40.00, 10)
) as v(nombre, descripcion, precio, capacidad)
where not exists (select 1 from public.destinos d where d.nombre = v.nombre);
