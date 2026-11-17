import { $, aviso, conCarga } from './utilidades.js';
import { abrirCamara, tomarFoto } from './camara.js';
import { crearCuenta, iniciarSesion, completarVerificacion, perfilActual } from '../servicios/autenticacion.js';

/** Ingreso: correo + contraseña (sin cámara). La cámara solo se abre en la verificación al crear la cuenta. */
export function montarAuth(alEntrar, pendiente = false) {
  let modo = pendiente ? 'registro' : 'login';
  let cuentaCreada = pendiente;   // true si ya existe la cuenta pero falta verificar el rostro
  let datos = {}, detener = null;

  const render = () => {
    const reg = modo === 'registro';
    $('#campos-registro').hidden = !reg;
    $('#campos-acceso').hidden = cuentaCreada;
    $('#cambiar-modo').hidden = cuentaCreada;
    $('#btn-auth').textContent = reg ? (cuentaCreada ? 'Continuar a la verificación' : 'Crear cuenta') : 'Ingresar';
    $('#cambiar-modo').textContent = reg ? 'Ya tengo cuenta' : '¿No tienes cuenta? Regístrate';
  };
  $('#cambiar-modo').onclick = (e) => { e.preventDefault(); modo = modo === 'login' ? 'registro' : 'login'; render(); };

  $('#btn-auth').onclick = (e) => conCarga(e.target, async () => {
    const f = Object.fromEntries(new FormData($('#form-auth')));
    if (modo === 'login') {
      const perfil = await iniciarSesion(f);
      if (perfil) return alEntrar(perfil);
      modo = 'registro'; cuentaCreada = true; render();
      return aviso('Tu cuenta aún no está verificada. Completa tus datos y la verificación.');
    }
    if (!f.nombre?.trim() || !f.ci?.trim()) throw new Error('Completa tu nombre y tu carnet de identidad.');
    if (!cuentaCreada) { await crearCuenta(f); cuentaCreada = true; }
    datos = { nombre: f.nombre, ci: f.ci, telefono: f.telefono, rol: f.rol };
    detener = await abrirCamara($('#video-auth'));     // la cámara se abre SOLO aquí
    $('#paso-cuenta').hidden = true; $('#paso-verificar').hidden = false;
  });

  $('#btn-verificar').onclick = (e) => conCarga(e.target, async () => {
    await completarVerificacion({ ...datos, fotoEl: tomarFoto($('#video-auth')) });
    detener?.();
    alEntrar(await perfilActual());
  });

  render();
}
