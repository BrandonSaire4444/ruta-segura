import { $, esc, aviso, conCarga } from './utilidades.js';
import { Mapa } from './mapa.js';
import { Vehiculo } from '../nucleo/dominio.js';
import { TipoTransporte } from '../nucleo/constantes.js';
import { db, ok } from '../servicios/cliente.js';
import * as Viajes from '../servicios/viajes.js';
import { escucharSolicitudes, responderSolicitud } from '../servicios/minibus.js';

export async function montarConductor(perfil) {
  const mapa = new Mapa('mapa');
  const vehs = ok(await db.from('vehiculos').select('*').eq('conductor_id', perfil.id));
  if (!vehs.length) return ($('#panel').innerHTML = '<p>Aún no tienes un vehículo registrado. Pide al administrador que lo asigne.</p>');
  const veh = new Vehiculo(vehs[0]);
  const esMinibus = veh.tipo === TipoTransporte.MINIBUS;
  $('#panel').innerHTML = `<h3>${esc(veh.tipo)} · ${esc(veh.placa)}</h3><button id="btn-turno">Iniciar turno</button><div id="cola"></div>`;
  let activo = false, watch = null, canales = [];

  $('#btn-turno').onclick = (e) => conCarga(e.target, async () => {
    activo = !activo;
    await db.from('vehiculos').update({ disponible: activo }).eq('id', veh.id);
    e.target.textContent = activo ? 'Terminar turno' : 'Iniciar turno';
    if (activo) {
      watch = navigator.geolocation.watchPosition((p) => {
        db.from('vehiculos').update({ lat: p.coords.latitude, lng: p.coords.longitude }).eq('id', veh.id).then(() => {});
        mapa.ponerYo([p.coords.latitude, p.coords.longitude]);
      }, () => aviso('GPS no disponible', 'error'), { enableHighAccuracy: true });
      canales = esMinibus ? [escucharSolicitudes(veh.id, tarjetaSolicitud)] : [Viajes.escucharViajesNuevos((v) => v.tipo === veh.tipo && tarjetaViaje(v))];
    } else { navigator.geolocation.clearWatch(watch); canales.forEach((c) => db.removeChannel(c)); $('#cola').innerHTML = ''; }
  });

  function tarjetaSolicitud(s) {
    $('#cola').insertAdjacentHTML('afterbegin', `<div class="tarjeta" id="s-${s.id}">Un pasajero quiere abordar
      <button data-a="1">Aceptar</button><button data-a="0" class="sec">Lleno</button></div>`);
    $(`#s-${s.id}`).querySelectorAll('button').forEach((b) => (b.onclick = () => conCarga(b, async () => {
      await responderSolicitud(s.id, b.dataset.a === '1', 'Minibús lleno, espera el siguiente');
      $(`#s-${s.id}`).remove();
    })));
  }

  function tarjetaViaje(v) {
    $('#cola').insertAdjacentHTML('afterbegin', `<div class="tarjeta" id="v-${v.id}">Viaje ${esc(v.tipo)} · Bs ${esc(v.tarifa)}<br><button data-ac>Aceptar</button></div>`);
    const el = $(`#v-${v.id}`);
    $('[data-ac]', el).onclick = (e) => conCarga(e.target, async () => {
      await Viajes.aceptarViaje(v.id, veh.id);
      mapa.marcar(v.origen, 'Recoger aquí').openPopup();
      el.innerHTML = '<button data-lle>Llegué</button><button data-fin class="sec">Finalizar</button>';
      $('[data-lle]', el).onclick = (x) => conCarga(x.target, () => Viajes.conductorLlego(v.id));
      $('[data-fin]', el).onclick = (x) => conCarga(x.target, async () => { await Viajes.finalizarViaje(v.id); el.remove(); });
    });
  }
}
