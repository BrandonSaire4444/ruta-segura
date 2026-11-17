-- =====================================================================
-- RUTA SEGURA · Datos de ejemplo (La Paz). Ejecutar DESPUÉS de 01_esquema.sql
-- Las coordenadas son aproximadas: reemplázalas por trazados reales
-- (puedes dibujarlos en geojson.io y copiar [lat,lng]).
-- =====================================================================
with s as (
  insert into sindicatos (nombre, ciudad) values ('Sindicato Mixto Sopocachi', 'La Paz') returning id
), l as (
  insert into lineas (sindicato_id, numero, nombre, ruta)
  select id, '230', 'San Francisco - Sopocachi - Plaza Avaroa',
  '[[-16.4955,-68.1363],[-16.4985,-68.1335],[-16.5010,-68.1310],[-16.5037,-68.1285],[-16.5066,-68.1275],[-16.5090,-68.1265],[-16.5115,-68.1257]]'::jsonb
  from s returning id
)
insert into paradas (linea_id, nombre, lat, lng)
select l.id, p.n, p.la, p.lo from l,
 (values ('Parada Plaza San Francisco', -16.4955, -68.1363),
         ('Parada Plaza del Estudiante', -16.5037, -68.1285),
         ('Parada Plaza Avaroa', -16.5115, -68.1257)) as p(n, la, lo);

insert into vehiculos (tipo, placa, marca, modelo, color, capacidad, linea_id, lat, lng)
select 'minibus', v.placa, 'Toyota', 'Coaster', v.color, 18, (select id from lineas where numero = '230'), v.la, v.lo
from (values ('1234-ABC','Blanco',-16.4985,-68.1335), ('5678-DEF','Celeste',-16.5066,-68.1275)) as v(placa, color, la, lo);

insert into vehiculos (tipo, placa, marca, modelo, color, capacidad, lat, lng) values
 ('taxi', '4321-XYZ', 'Suzuki', 'Swift', 'Amarillo', 4, -16.5000, -68.1300),
 ('moto', '9876-MNO', 'Honda', 'CG 150', 'Rojo', 1, -16.5020, -68.1290);

-- ---------------------------------------------------------------------
-- PASOS MANUALES tras registrar usuarios desde la app:
--   1) Convertir a un usuario en administrador:
--        update usuarios set rol = 'admin' where ci = 'TU_CI';
--   2) Asignar un vehículo a un conductor registrado:
--        update vehiculos set conductor_id = (select id from usuarios where ci = 'CI_CONDUCTOR')
--        where placa = '4321-XYZ';
-- ---------------------------------------------------------------------
