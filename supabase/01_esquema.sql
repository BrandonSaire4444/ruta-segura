-- =====================================================================
-- RUTA SEGURA · Base de datos completa para Supabase (PostgreSQL)
-- Ejecutar COMPLETO en: Supabase > SQL Editor > New query > Run
-- Luego ejecutar 02_datos_prueba.sql
-- =====================================================================

-- 1. TABLAS ------------------------------------------------------------
create table configuracion (
  clave text primary key,
  valor text not null
);
insert into configuracion values ('umbral_facial', '0.5');  -- distancia máxima para "mismo rostro"

create table sindicatos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  ciudad text not null
);

create table lineas (
  id uuid primary key default gen_random_uuid(),
  sindicato_id uuid not null references sindicatos(id) on delete cascade,
  numero text not null,
  nombre text,
  ruta jsonb not null check (jsonb_typeof(ruta) = 'array'),   -- [[lat,lng],...]
  unique (sindicato_id, numero)
);

create table paradas (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references lineas(id) on delete cascade,
  nombre text not null,
  lat float8 not null check (lat between -90 and 90),
  lng float8 not null check (lng between -180 and 180)
);

create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) >= 3),
  ci text not null unique check (length(trim(ci)) >= 5),
  telefono text,
  rol text not null check (rol in ('pasajero','conductor','admin')),
  descriptor_facial float8[] not null check (array_length(descriptor_facial, 1) = 128),
  verificada_en timestamptz not null default now(),   -- momento de la verificación facial al crear la cuenta
  created_at timestamptz not null default now()
);

create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid references usuarios(id) on delete set null,
  linea_id uuid references lineas(id) on delete set null,
  tipo text not null check (tipo in ('minibus','taxi','moto')),
  placa text not null unique,
  marca text, modelo text, color text,
  capacidad int not null default 4 check (capacidad > 0),
  asientos_ocupados int not null default 0,
  disponible boolean not null default false,
  lat float8, lng float8,
  check (asientos_ocupados between 0 and capacidad),
  check (tipo = 'minibus' or linea_id is null)
);

create table viajes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pasajero_id uuid not null references usuarios(id),
  conductor_id uuid references usuarios(id),
  vehiculo_id uuid references vehiculos(id),
  tipo text not null check (tipo in ('taxi','moto')),
  origen_lat float8 not null, origen_lng float8 not null,
  destino_lat float8 not null, destino_lng float8 not null,
  tarifa numeric(8,2) not null check (tarifa >= 0),
  estado text not null default 'solicitado'
    check (estado in ('solicitado','conductor_asignado','en_verificacion','en_curso','finalizado','cancelado')),
  verificado boolean not null default false,
  check (pasajero_id <> conductor_id),
  check (estado in ('solicitado','cancelado') or conductor_id is not null)
);

create table verificaciones (
  id uuid primary key default gen_random_uuid(),
  viaje_id uuid not null references viajes(id) on delete cascade,
  distancia float8,
  resultado text not null check (resultado in ('coincide','no_coincide','error')),
  created_at timestamptz not null default now()
);

create table solicitudes_minibus (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pasajero_id uuid not null references usuarios(id),
  vehiculo_id uuid not null references vehiculos(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','rechazada_lleno')),
  mensaje text
);

create table calificaciones (
  id uuid primary key default gen_random_uuid(),
  viaje_id uuid not null references viajes(id) on delete cascade,
  evaluador_id uuid not null references usuarios(id),
  evaluado_id uuid not null references usuarios(id),
  puntos int not null check (puntos between 1 and 5),
  comentario text,
  created_at timestamptz not null default now(),
  unique (viaje_id, evaluador_id),
  check (evaluador_id <> evaluado_id)
);

-- 2. ÍNDICES -----------------------------------------------------------
create index on paradas (linea_id);
create index on vehiculos (conductor_id);
create index on vehiculos (linea_id) where tipo = 'minibus';
create index on vehiculos (tipo, disponible);
create index on viajes (estado);
create index on viajes (pasajero_id, created_at desc);
create index on viajes (conductor_id, created_at desc);
create index on verificaciones (viaje_id);
create index on solicitudes_minibus (vehiculo_id, estado);
create index on solicitudes_minibus (pasajero_id);
create index on calificaciones (evaluado_id);

-- 3. FUNCIONES AUXILIARES ---------------------------------------------
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'admin') $$;

create or replace function es_conductor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'conductor') $$;

create or replace function distancia_euclidiana(a float8[], b float8[]) returns float8
language sql immutable as $$
  select case when array_length(a, 1) = array_length(b, 1)
    then (select sqrt(sum(power(x - y, 2))) from unnest(a, b) as t(x, y)) end $$;

create or replace function umbral_facial() returns float8
language sql stable security definer set search_path = public as $$
  select valor::float8 from configuracion where clave = 'umbral_facial' $$;

-- 4. FUNCIONES BIOMÉTRICAS (la comparación ocurre SOLO en el servidor) ----
-- El rostro se usa en 2 casos: (a) al crear la cuenta y (b) al verificar a un conductor de taxi/moto.
-- El ingreso normal NO usa biometría.
create or replace function registrar_usuario(p_nombre text, p_ci text, p_telefono text, p_rol text, p_descriptor float8[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  if p_rol not in ('pasajero','conductor') then raise exception 'Rol no permitido'; end if;
  if array_length(p_descriptor, 1) is distinct from 128 then raise exception 'Descriptor facial inválido'; end if;
  if exists (select 1 from usuarios where distancia_euclidiana(descriptor_facial, p_descriptor) <= umbral_facial()) then
    raise exception 'Este rostro ya está asociado a otra cuenta';   -- evita cuentas duplicadas
  end if;
  insert into usuarios (id, nombre, ci, telefono, rol, descriptor_facial)
  values (auth.uid(), trim(p_nombre), trim(p_ci), p_telefono, p_rol, p_descriptor);
end $$;

create or replace function verificar_conductor_viaje(p_viaje uuid, p_descriptor float8[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v viajes; d float8; coincide boolean;
begin
  select * into v from viajes
   where id = p_viaje and pasajero_id = auth.uid() and estado = 'en_verificacion';
  if not found then raise exception 'El viaje no está en verificación'; end if;
  select distancia_euclidiana(descriptor_facial, p_descriptor) into d from usuarios where id = v.conductor_id;
  coincide := d is not null and d <= umbral_facial();
  insert into verificaciones (viaje_id, distancia, resultado)
  values (p_viaje, d, case when coincide then 'coincide' else 'no_coincide' end);
  update viajes set verificado = coincide where id = p_viaje;
  return jsonb_build_object('coincide', coincide, 'distancia', d);
end $$;

-- 5. TRIGGERS DE REGLAS DE NEGOCIO ---------------------------------------
-- 5.1 Máquina de estados del viaje (taxi y moto)
create or replace function validar_viaje() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); v vehiculos;
begin
  if u is null then return new; end if;   -- SQL Editor / service role
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
create trigger trg_validar_viaje before update on viajes for each row execute function validar_viaje();

-- 5.2 Solicitudes de minibús: solo pendiente -> aceptada / rechazada_lleno
create or replace function validar_solicitud() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if old.estado <> 'pendiente' then raise exception 'La solicitud ya fue respondida'; end if;
  if new.estado not in ('aceptada','rechazada_lleno') then raise exception 'Estado no permitido'; end if;
  if new.pasajero_id <> old.pasajero_id or new.vehiculo_id <> old.vehiculo_id then
    raise exception 'No se puede modificar la solicitud';
  end if;
  return new;
end $$;
create trigger trg_validar_solicitud before update on solicitudes_minibus for each row execute function validar_solicitud();

-- 5.3 Al aceptar, se ocupa un asiento del minibús
create or replace function ocupar_asiento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'aceptada' and old.estado = 'pendiente' then
    update vehiculos set asientos_ocupados = least(capacidad, asientos_ocupados + 1) where id = new.vehiculo_id;
  end if;
  return new;
end $$;
create trigger trg_ocupar_asiento after update on solicitudes_minibus for each row execute function ocupar_asiento();

-- 6. VISTA DE CALIFICACIÓN PROMEDIO --------------------------------------
create view calificaciones_promedio as
  select evaluado_id as usuario_id, round(avg(puntos)::numeric, 2) as promedio, count(*) as total
  from calificaciones group by evaluado_id;

-- 7. PERMISOS (principio de mínimo privilegio) ---------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- usuarios: NUNCA se exponen ci ni descriptor_facial al navegador
grant select (id, nombre, telefono, rol, verificada_en, created_at) on usuarios to authenticated;
grant select on sindicatos, lineas, paradas, vehiculos, calificaciones_promedio to authenticated;
grant update (disponible, lat, lng, asientos_ocupados) on vehiculos to authenticated;
grant select, insert on viajes to authenticated;
grant update (conductor_id, vehiculo_id, estado) on viajes to authenticated;
grant select on verificaciones to authenticated;
grant select, insert on solicitudes_minibus to authenticated;
grant update (estado, mensaje) on solicitudes_minibus to authenticated;
grant select, insert on calificaciones to authenticated;

grant execute on function es_admin(), es_conductor() to authenticated;
grant execute on function registrar_usuario(text, text, text, text, float8[]) to authenticated;
grant execute on function verificar_conductor_viaje(uuid, float8[]) to authenticated;

-- 8. ROW LEVEL SECURITY -----------------------------------------------------
alter table configuracion enable row level security;         -- sin políticas: solo funciones internas
alter table sindicatos enable row level security;
alter table lineas enable row level security;
alter table paradas enable row level security;
alter table usuarios enable row level security;
alter table vehiculos enable row level security;
alter table viajes enable row level security;
alter table verificaciones enable row level security;
alter table solicitudes_minibus enable row level security;
alter table calificaciones enable row level security;

create policy sindicatos_ver on sindicatos for select to authenticated using (true);
create policy lineas_ver on lineas for select to authenticated using (true);
create policy paradas_ver on paradas for select to authenticated using (true);
create policy vehiculos_ver on vehiculos for select to authenticated using (true);  -- placa visible por seguridad

create policy usuarios_ver on usuarios for select to authenticated using (
  id = auth.uid() or es_admin()
  or exists (select 1 from viajes v where
       (v.pasajero_id = auth.uid() and v.conductor_id = usuarios.id)
    or (v.conductor_id = auth.uid() and v.pasajero_id = usuarios.id))
);

create policy vehiculos_editar_propio on vehiculos for update to authenticated
  using (conductor_id = auth.uid()) with check (conductor_id = auth.uid());

create policy viajes_ver on viajes for select to authenticated using (
  pasajero_id = auth.uid() or conductor_id = auth.uid()
  or (estado = 'solicitado' and es_conductor())
);
create policy viajes_crear on viajes for insert to authenticated
  with check (pasajero_id = auth.uid() and estado = 'solicitado' and conductor_id is null and verificado = false);
create policy viajes_actualizar on viajes for update to authenticated using (
  pasajero_id = auth.uid() or conductor_id = auth.uid() or (estado = 'solicitado' and es_conductor())
);

create policy verificaciones_ver on verificaciones for select to authenticated using (
  exists (select 1 from viajes v where v.id = viaje_id and (v.pasajero_id = auth.uid() or v.conductor_id = auth.uid()))
);

create policy solicitudes_ver on solicitudes_minibus for select to authenticated using (
  pasajero_id = auth.uid()
  or exists (select 1 from vehiculos v where v.id = vehiculo_id and v.conductor_id = auth.uid())
);
create policy solicitudes_crear on solicitudes_minibus for insert to authenticated with check (
  pasajero_id = auth.uid() and estado = 'pendiente'
  and exists (select 1 from vehiculos v where v.id = vehiculo_id and v.tipo = 'minibus')
);
create policy solicitudes_responder on solicitudes_minibus for update to authenticated
  using (exists (select 1 from vehiculos v where v.id = vehiculo_id and v.conductor_id = auth.uid()));

create policy calificaciones_ver on calificaciones for select to authenticated
  using (evaluador_id = auth.uid() or evaluado_id = auth.uid());
create policy calificaciones_crear on calificaciones for insert to authenticated with check (
  evaluador_id = auth.uid() and exists (
    select 1 from viajes v where v.id = viaje_id and v.estado = 'finalizado'
      and ((v.pasajero_id = auth.uid() and v.conductor_id = evaluado_id)
        or (v.conductor_id = auth.uid() and v.pasajero_id = evaluado_id)))
);

-- 9. REALTIME ----------------------------------------------------------------
alter publication supabase_realtime add table viajes, solicitudes_minibus;
