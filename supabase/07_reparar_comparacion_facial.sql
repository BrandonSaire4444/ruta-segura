-- =====================================================================
-- RUTA SEGURA · 07 · Comparación facial robusta + limpieza de rostros inválidos
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de corregir los modelos faciales.
-- =====================================================================

-- 1. Distancia que rechaza datos vacíos (antes devolvía NULL sin avisar)
create or replace function distancia_euclidiana(a float8[], b float8[]) returns float8
language plpgsql immutable as $$
declare s float8 := 0; i int;
begin
  if a is null or b is null or array_length(a, 1) is distinct from array_length(b, 1) then return null; end if;
  for i in 1..array_length(a, 1) loop
    if a[i] is null or b[i] is null then return null; end if;
    s := s + (a[i] - b[i]) * (a[i] - b[i]);
  end loop;
  return sqrt(s);
end $$;

-- 2. El registro rechaza rostros con valores vacíos
create or replace function registrar_usuario(p_nombre text, p_ci text, p_telefono text, p_rol text, p_descriptor float8[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  if p_rol not in ('pasajero','conductor') then raise exception 'Rol no permitido'; end if;
  if array_length(p_descriptor, 1) is distinct from 128 or array_position(p_descriptor, null) is not null then
    raise exception 'Rostro inválido. Intenta de nuevo con buena luz';
  end if;
  if exists (select 1 from usuarios where distancia_euclidiana(descriptor_facial, p_descriptor) <= umbral_facial()) then
    raise exception 'Este rostro ya está asociado a otra cuenta';
  end if;
  insert into usuarios (id, nombre, ci, telefono, rol, descriptor_facial)
  values (auth.uid(), trim(p_nombre), trim(p_ci), p_telefono, p_rol, p_descriptor);
end $$;

-- 3. La verificación del conductor también rechaza datos vacíos
create or replace function verificar_conductor_viaje(p_viaje uuid, p_descriptor float8[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v viajes; reg float8[]; d float8; coincide boolean;
begin
  select * into v from viajes where id = p_viaje and pasajero_id = auth.uid() and estado = 'en_verificacion';
  if not found then raise exception 'El viaje no está en verificación'; end if;
  if v.conductor_id is null then raise exception 'El viaje no tiene conductor asignado'; end if;
  if array_length(p_descriptor, 1) is distinct from 128 or array_position(p_descriptor, null) is not null then
    raise exception 'Foto no válida, intenta de nuevo';
  end if;
  select descriptor_facial into reg from usuarios where id = v.conductor_id;
  if reg is null or array_position(reg, null) is not null then
    raise exception 'El rostro registrado del conductor es inválido; debe volver a registrarse';
  end if;
  d := distancia_euclidiana(reg, p_descriptor);
  coincide := d is not null and d <= umbral_facial();
  insert into verificaciones (viaje_id, distancia, resultado)
  values (p_viaje, d, case when coincide then 'coincide' else 'no_coincide' end);
  update viajes set verificado = coincide where id = p_viaje;
  return jsonb_build_object('coincide', coincide, 'distancia', d);
end $$;

-- 4. DIAGNÓSTICO: ¿quiénes tienen el rostro inválido? (los administradores se respetan)
select nombre, rol, ci, array_position(descriptor_facial, null) is not null as rostro_invalido
from usuarios order by created_at;

-- 5. LIMPIEZA: borra las cuentas de prueba con rostro inválido para que se registren de nuevo.
--    (No toca administradores. Borra también sus viajes/solicitudes de prueba.)
do $$
declare ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids from usuarios
   where rol <> 'admin' and array_position(descriptor_facial, null) is not null;
  delete from calificaciones where evaluador_id = any(ids) or evaluado_id = any(ids)
     or viaje_id in (select id from viajes where pasajero_id = any(ids) or conductor_id = any(ids));
  delete from verificaciones where viaje_id in (select id from viajes where pasajero_id = any(ids) or conductor_id = any(ids));
  delete from solicitudes_minibus where pasajero_id = any(ids);
  delete from viajes where pasajero_id = any(ids) or conductor_id = any(ids);
  delete from auth.users where id = any(ids);   -- borra también su fila en usuarios
end $$;
