-- =====================================================================
-- RUTA SEGURA · 04 · Aprobación de conductores y vehículos por el administrador
-- Ejecutar DESPUÉS de 01_esquema.sql (y 02 / 03 si ya los corriste).
-- Supabase > SQL Editor > New query > pegar TODO > Run
--
-- Flujo:
--   1. El conductor crea su cuenta (selfie) y registra su vehículo + licencia.
--   2. El vehículo queda "pendiente": no puede iniciar turno ni recibir viajes.
--   3. El administrador lo revisa y lo aprueba, rechaza (con motivo) o suspende.
--   4. Solo vehículos "aprobado" aparecen a los pasajeros y pueden aceptar viajes.
-- =====================================================================

-- 1. COLUMNAS NUEVAS ------------------------------------------------------
alter table usuarios add column if not exists licencia text;   -- nunca se expone al navegador (solo al admin)

alter table vehiculos add column if not exists estado_aprobacion text not null default 'aprobado'
  check (estado_aprobacion in ('pendiente','aprobado','rechazado','suspendido'));
alter table vehiculos add column if not exists motivo_revision text;
alter table vehiculos add column if not exists revisado_por uuid references usuarios(id) on delete set null;
alter table vehiculos add column if not exists revisado_en timestamptz;
alter table vehiculos add column if not exists creado_en timestamptz not null default now();

-- Los vehículos que ya existían (datos de prueba) quedan aprobados; los NUEVOS nacen pendientes.
alter table vehiculos alter column estado_aprobacion set default 'pendiente';

-- Un conductor tiene un solo vehículo (si se lo rechazan, corrige el mismo registro).
create unique index if not exists vehiculos_un_conductor on vehiculos (conductor_id) where conductor_id is not null;
create index if not exists vehiculos_estado_aprobacion on vehiculos (estado_aprobacion, creado_en desc);

-- 2. EL CONDUCTOR REGISTRA (O CORRIGE) SU VEHÍCULO -------------------------
create or replace function registrar_vehiculo(
  p_tipo text, p_placa text, p_marca text, p_modelo text, p_color text,
  p_capacidad int, p_linea uuid, p_licencia text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_placa text := upper(regexp_replace(coalesce(p_placa, ''), '\s', '', 'g'));
  v_cap int;
  v_actual vehiculos;
  v_existe boolean;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  if not es_conductor() then raise exception 'Solo los conductores pueden registrar un vehículo'; end if;
  if p_tipo not in ('minibus','taxi','moto') then raise exception 'Tipo de vehículo no válido'; end if;
  if length(v_placa) < 5 then raise exception 'Escribe una placa válida (ej. 1234ABC)'; end if;
  if length(trim(coalesce(p_licencia, ''))) < 5 then raise exception 'Escribe tu número de licencia de conducir'; end if;
  if coalesce(trim(p_marca), '') = '' or coalesce(trim(p_modelo), '') = '' or coalesce(trim(p_color), '') = '' then
    raise exception 'Completa marca, modelo y color del vehículo';
  end if;

  v_cap := case p_tipo when 'moto' then 1 when 'taxi' then coalesce(p_capacidad, 4) else p_capacidad end;
  if p_tipo = 'taxi' and v_cap not between 1 and 6 then raise exception 'Un taxi lleva entre 1 y 6 pasajeros'; end if;
  if p_tipo = 'minibus' then
    if v_cap is null or v_cap not between 8 and 30 then raise exception 'Un minibús lleva entre 8 y 30 pasajeros'; end if;
    if p_linea is null or not exists (select 1 from lineas where id = p_linea) then
      raise exception 'Elige la línea de tu minibús';
    end if;
  end if;

  if exists (select 1 from vehiculos where placa = v_placa and conductor_id is distinct from auth.uid()) then
    raise exception 'La placa % ya está registrada', v_placa;
  end if;

  select * into v_actual from vehiculos where conductor_id = auth.uid();
  v_existe := found;
  if v_existe and v_actual.estado_aprobacion <> 'rechazado' then
    raise exception 'Ya tienes un vehículo registrado (estado: %)', v_actual.estado_aprobacion;
  end if;

  update usuarios set licencia = trim(p_licencia) where id = auth.uid();

  if v_existe then   -- reenvío tras un rechazo: se corrige el mismo registro y vuelve a revisión
    update vehiculos set tipo = p_tipo, placa = v_placa, marca = trim(p_marca), modelo = trim(p_modelo),
           color = trim(p_color), capacidad = v_cap, asientos_ocupados = 0,
           linea_id = case when p_tipo = 'minibus' then p_linea end,
           estado_aprobacion = 'pendiente', motivo_revision = null, revisado_por = null, revisado_en = null,
           disponible = false, creado_en = now()
     where id = v_actual.id returning id into v_id;
  else
    insert into vehiculos (conductor_id, tipo, placa, marca, modelo, color, capacidad, linea_id, estado_aprobacion, disponible)
    values (auth.uid(), p_tipo, v_placa, trim(p_marca), trim(p_modelo), trim(p_color), v_cap,
            case when p_tipo = 'minibus' then p_linea end, 'pendiente', false)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- 3. FUNCIONES DEL ADMINISTRADOR -------------------------------------------
-- Lista TODOS los vehículos con los datos de su conductor (incluye CI y licencia, solo para el admin).
create or replace function admin_listar_vehiculos()
returns table (
  id uuid, tipo text, placa text, marca text, modelo text, color text, capacidad int,
  estado_aprobacion text, motivo_revision text, creado_en timestamptz, revisado_en timestamptz,
  linea_numero text, linea_nombre text, sindicato text,
  conductor_id uuid, conductor_nombre text, conductor_ci text, conductor_telefono text,
  conductor_licencia text, conductor_verificada_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el administrador puede ver esta información'; end if;
  return query
    select v.id, v.tipo, v.placa, v.marca, v.modelo, v.color, v.capacidad,
           v.estado_aprobacion, v.motivo_revision, v.creado_en, v.revisado_en,
           l.numero, l.nombre, s.nombre,
           u.id, u.nombre, u.ci, u.telefono, u.licencia, u.verificada_en
      from vehiculos v
      left join usuarios u on u.id = v.conductor_id
      left join lineas l on l.id = v.linea_id
      left join sindicatos s on s.id = l.sindicato_id
     order by (v.estado_aprobacion = 'pendiente') desc, v.creado_en desc;
end $$;

-- Aprueba, rechaza, suspende o reactiva un vehículo. Rechazar y suspender exigen motivo.
create or replace function admin_revisar_vehiculo(p_vehiculo uuid, p_estado text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el administrador puede aprobar vehículos'; end if;
  if p_estado not in ('aprobado','rechazado','suspendido') then raise exception 'Estado no válido'; end if;
  if p_estado <> 'aprobado' and length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo (el conductor lo verá)';
  end if;
  update vehiculos
     set estado_aprobacion = p_estado,
         motivo_revision = case when p_estado = 'aprobado' then null else trim(p_motivo) end,
         revisado_por = auth.uid(), revisado_en = now(),
         disponible = case when p_estado = 'aprobado' then disponible else false end
   where id = p_vehiculo;
  if not found then raise exception 'Vehículo no encontrado'; end if;
end $$;

-- 4. REGLAS: SOLO VEHÍCULOS APROBADOS TRABAJAN ------------------------------
-- 4.1 No se puede iniciar turno (disponible = true) sin aprobación.
create or replace function validar_vehiculo_aprobado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or es_admin() then return new; end if;
  if new.disponible and new.estado_aprobacion <> 'aprobado' then
    raise exception 'Tu vehículo aún no fue aprobado por el administrador';
  end if;
  return new;
end $$;
drop trigger if exists trg_vehiculo_aprobado on vehiculos;
create trigger trg_vehiculo_aprobado before update on vehiculos
  for each row execute function validar_vehiculo_aprobado();

-- 4.2 Solo un vehículo aprobado puede aceptar un viaje de taxi o moto
--     (misma máquina de estados de 01_esquema.sql + la condición de aprobación).
create or replace function validar_viaje() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); v vehiculos;
begin
  if u is null then return new; end if;
  if new.estado = old.estado then
    if new.conductor_id is distinct from old.conductor_id or new.vehiculo_id is distinct from old.vehiculo_id then
      raise exception 'No se puede cambiar el conductor del viaje';
    end if;
    return new;
  end if;

  if old.estado = 'solicitado' and new.estado = 'conductor_asignado' then
    select * into v from vehiculos where id = new.vehiculo_id;
    if not es_conductor() or new.conductor_id is distinct from u
       or v.conductor_id is distinct from u or v.tipo is distinct from old.tipo then
      raise exception 'Solo un conductor con vehículo del tipo solicitado puede aceptar';
    end if;
    if v.estado_aprobacion is distinct from 'aprobado' then
      raise exception 'Tu vehículo aún no fue aprobado por el administrador';
    end if;
    return new;
  end if;

  if new.conductor_id is distinct from old.conductor_id or new.vehiculo_id is distinct from old.vehiculo_id then
    raise exception 'No se puede cambiar el conductor del viaje';
  end if;

  if old.estado = 'conductor_asignado' and new.estado = 'en_verificacion' then
    if u is distinct from old.conductor_id then raise exception 'Solo el conductor marca su llegada'; end if;
  elsif old.estado = 'en_verificacion' and new.estado = 'en_curso' then
    if u is distinct from old.pasajero_id or not old.verificado then
      raise exception 'El conductor debe estar verificado por el pasajero';
    end if;
  elsif old.estado = 'en_curso' and new.estado = 'finalizado' then
    if u is distinct from old.conductor_id and u is distinct from old.pasajero_id then
      raise exception 'No autorizado';
    end if;
  elsif new.estado = 'cancelado' and old.estado in ('solicitado','conductor_asignado','en_verificacion') then
    if u is distinct from old.pasajero_id and u is distinct from old.conductor_id then
      raise exception 'No autorizado';
    end if;
  else
    raise exception 'Transición no permitida: % -> %', old.estado, new.estado;
  end if;
  return new;
end $$;

-- 4.3 Los pasajeros solo ven vehículos aprobados; el conductor ve el suyo; el admin ve todos.
drop policy if exists vehiculos_ver on vehiculos;
create policy vehiculos_ver on vehiculos for select to authenticated using (
  estado_aprobacion = 'aprobado' or conductor_id = auth.uid() or es_admin()
);

-- 4.4 Solo se puede pedir abordar un minibús aprobado.
drop policy if exists solicitudes_crear on solicitudes_minibus;
create policy solicitudes_crear on solicitudes_minibus for insert to authenticated with check (
  pasajero_id = auth.uid() and estado = 'pendiente'
  and exists (select 1 from vehiculos v where v.id = vehiculo_id and v.tipo = 'minibus' and v.estado_aprobacion = 'aprobado')
);

-- 5. PERMISOS ---------------------------------------------------------------
revoke all on function registrar_vehiculo(text, text, text, text, text, int, uuid, text) from public, anon;
revoke all on function admin_listar_vehiculos() from public, anon;
revoke all on function admin_revisar_vehiculo(uuid, text, text) from public, anon;
revoke all on function validar_vehiculo_aprobado() from public, anon, authenticated;
grant execute on function registrar_vehiculo(text, text, text, text, text, int, uuid, text) to authenticated;
grant execute on function admin_listar_vehiculos() to authenticated;
grant execute on function admin_revisar_vehiculo(uuid, text, text) to authenticated;

-- 6. CÓMO CREAR AL ADMINISTRADOR ---------------------------------------------
-- El admin NO se registra desde la app como admin (para que nadie se autoasigne el rol).
-- Crea una cuenta normal desde la app (pasajero) y luego ejecuta aquí:
--
--     update usuarios set rol = 'admin' where ci = 'TU_CARNET';
--
-- Al volver a entrar, esa cuenta verá el panel de aprobación.
