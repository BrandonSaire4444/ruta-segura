import { $, aviso } from './ui/utilidades.js';
import { perfilActual, haySesion, cerrarSesion } from './servicios/autenticacion.js';
import { montarAuth } from './ui/vistaAuth.js';
import { montarPasajero } from './ui/vistaPasajero.js';
import { montarConductor } from './ui/vistaConductor.js';
import { montarAdmin } from './ui/vistaAdmin.js';
import { Rol } from './nucleo/constantes.js';

function entrar(perfil) {
  $('#pantalla-auth').hidden = true; $('#pantalla-app').hidden = false;
  $('#saludo').textContent = `Hola, ${perfil.nombre} ✔${perfil.rol === Rol.ADMIN ? ' · Admin' : ''}`;
  $('#salir').onclick = async () => { await cerrarSesion(); location.reload(); };
  $('#selector').hidden = perfil.rol !== Rol.PASAJERO;
  const pantallas = { [Rol.ADMIN]: montarAdmin, [Rol.CONDUCTOR]: montarConductor, [Rol.PASAJERO]: montarPasajero };
  (pantallas[perfil.rol] || montarPasajero)(perfil).catch((e) => aviso(e.message, 'error'));
}

// Si ya hay sesión se entra directo (sin cámara). Si la cuenta quedó sin verificar, se retoma la verificación.
const perfil = await perfilActual().catch(() => null);
perfil ? entrar(perfil) : montarAuth(entrar, await haySesion().catch(() => false));
