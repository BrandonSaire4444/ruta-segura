-- Para quien YA ejecutó la versión anterior de 01_esquema.sql.
-- Quita el reconocimiento facial del ingreso y añade verificación única al crear la cuenta.
alter table usuarios add column if not exists verificada_en timestamptz not null default now();
grant select (verificada_en) on usuarios to authenticated;
drop function if exists verificar_rostro(uuid, float8[]);

create or replace function registrar_usuario(p_nombre text, p_ci text, p_telefono text, p_rol text, p_descriptor float8[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  if p_rol not in ('pasajero','conductor') then raise exception 'Rol no permitido'; end if;
  if array_length(p_descriptor, 1) is distinct from 128 then raise exception 'Descriptor facial inválido'; end if;
  if exists (select 1 from usuarios where distancia_euclidiana(descriptor_facial, p_descriptor) <= umbral_facial()) then
    raise exception 'Este rostro ya está asociado a otra cuenta';
  end if;
  insert into usuarios (id, nombre, ci, telefono, rol, descriptor_facial)
  values (auth.uid(), trim(p_nombre), trim(p_ci), p_telefono, p_rol, p_descriptor);
end $$;
