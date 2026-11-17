import { db, ok } from './cliente.js';
import { biometrico } from './biometrico.js';

/** Paso 1 del registro: crea la cuenta de acceso (correo + contraseña). */
export async function crearCuenta({ correo, clave }) {
  const { data, error } = await db.auth.signUp({ email: correo, password: clave });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Desactiva "Confirm email" en Supabase (Authentication > Providers > Email) para continuar.');
  return data.user;
}

/** Paso 2 del registro: selfie de verificación. Es la ÚNICA vez que se pide el rostro de la cuenta.
 *  El perfil solo existe si el rostro fue detectado, por eso toda cuenta creada está verificada. */
export async function completarVerificacion({ nombre, ci, telefono, rol, fotoEl }) {
  const descriptor = await biometrico.extraerDescriptor(fotoEl);
  if (!descriptor) throw new Error('No detectamos tu rostro. Mira de frente, con buena luz y sin lentes oscuros.');
  ok(await db.rpc('registrar_usuario', { p_nombre: nombre, p_ci: ci, p_telefono: telefono, p_rol: rol, p_descriptor: descriptor }));
}

/** Ingreso normal: solo correo y contraseña. Devuelve el perfil, o null si la cuenta aún no fue verificada. */
export async function iniciarSesion({ correo, clave }) {
  const { error } = await db.auth.signInWithPassword({ email: correo, password: clave });
  if (error) throw new Error('Correo o contraseña incorrectos.');
  return perfilActual();
}

export async function haySesion() {
  const { data } = await db.auth.getSession();
  return !!data.session;
}

export async function perfilActual() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return null;
  return ok(await db.from('usuarios').select('id,nombre,telefono,rol,verificada_en').eq('id', session.user.id).maybeSingle());
}
export const cerrarSesion = () => db.auth.signOut();
