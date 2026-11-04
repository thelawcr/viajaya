-- Datos de ejemplo para pruebas manuales (opcional)
insert into public.destinos (nombre, descripcion, precio_base, capacidad_diaria) values
  ('Volcán Arenal',              'Caminata y aguas termales',         85.00, 20),
  ('Parque Nacional Tortuguero', 'Tour en lancha por los canales',   120.00, 12),
  ('Rafting Río Pacuare',        'Aventura de aguas bravas',          95.00, 16)
on conflict do nothing;
