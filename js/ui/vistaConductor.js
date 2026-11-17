import { $, esc, aviso, conCarga } from './utilidades.js';
import { Mapa } from './mapa.js';
import { TipoTransporte, EstadoAprobacion } from '../nucleo/constantes.js';
import { db } from '../servicios/cliente.js';
import * as Viajes from '../servicios/viajes.js';
import { escucharSolicitudes, responderSolicitud } from '../servicios/minibus.js';
import { miVehiculo, registrarVehiculo, listarLineas } from '../servicios/vehiculos.js';

/** Pantalla del conductor. Lo que ve depende del estado de aprobación de su vehículo:
 *  sin vehículo → formulario · pendiente → en revisión · rechazado → motivo + corregir
 *  suspendido → aviso · aprobado → turno de trabajo. */
export async function montarConductor(perfil) {
  const mapa = new Mapa('mapa');
  await mostrarSegunEstado();

  async function mostrarSegunEstado() {
    const veh = await miVehiculo(perfil.id);
    if (!veh) return formularioVehiculo();
    switch (veh.estado_aprobacion) {
      case EstadoAprobacion.PENDIENTE: return enRevision(veh);
      case EstadoAprobacion.RECHAZADO: return formularioVehiculo(veh);
      case EstadoAprobacion.SUSPENDIDO: return suspendido(veh);
      default: return turno(veh);
    }
  }

  // --- Sin vehículo o rechazado: registrar / corregir -------------------------
  async function formularioVehiculo(previo = null) {
    const lineas = await listarLineas().catch(() => []);
    const v = previo || {};
    $('#panel').innerHTML = `
      ${previo
        ? `<div class="estado-caja estado-caja--rechazado"><b>Tu solicitud fue rechazada</b><p>${esc(previo.motivo_revision)}</p><p>Corrige los datos y vuelve a enviarla.</p></div>`
        : `<h3>Registra tu vehículo</h3><p class="adm-sub">Un administrador revisará tus datos antes de que puedas recibir pasajeros.</p>`}
      <form id="form-vehiculo" class="form-vehiculo" onsubmit="return false">
        <label>Tipo de vehículo
          <select name="tipo">
            <option value="taxi">🚕 Taxi</option>
            <option value="moto">🏍️ Moto</option>
            <option value="minibus">🚐 Minibús</option>
          </select>
        </label>
        <label>Placa <input name="placa" placeholder="Ej. 1234ABC" value="${esc(v.placa)}"></label>
        <label>Marca <input name="marca" placeholder="Ej. Toyota" value="${esc(v.marca)}"></label>
        <label>Modelo <input name="modelo" placeholder="Ej. Corolla 2018" value="${esc(v.modelo)}"></label>
        <label>Color <input name="color" placeholder="Ej. Blanco" value="${esc(v.color)}"></label>
        <label data-solo="taxi minibus">Pasajeros <input name="capacidad" type="number" min="1" max="30" value="${esc(v.capacidad || 4)}"></label>
        <label data-solo="minibus">Línea
          <select name="linea">
            <option value="">Elige tu línea…</option>
            ${lineas.map((l) => `<option value="${l.id}" ${l.id === v.linea_id ? 'selected' : ''}>Línea ${esc(l.numero)} · ${esc(l.sindicatos?.nombre)}</option>`).join('')}
          </select>
        </label>
        <label class="ancho">N.º de licencia de conducir <input name="licencia" placeholder="Ej. 1234567"></label>
        <button id="btn-enviar-vehiculo" type="button" class="ancho">${previo ? 'Reenviar a revisión' : 'Enviar a revisión'}</button>
      </form>`;

    const form = $('#form-vehiculo');
    const tipoSel = form.elements.tipo;
    if (v.tipo) tipoSel.value = v.tipo;
    const ajustar = () => {
      form.querySelectorAll('[data-solo]').forEach((el) => (el.hidden = !el.dataset.solo.split(' ').includes(tipoSel.value)));
      if (tipoSel.value === 'minibus' && Number(form.elements.capacidad.value) < 8) form.elements.capacidad.value = 18;
      if (tipoSel.value === 'taxi' && Number(form.elements.capacidad.value) > 6) form.elements.capacidad.value = 4;
    };
    tipoSel.onchange = ajustar;
    ajustar();

    $('#btn-enviar-vehiculo').onclick = (e) => conCarga(e.target, async () => {
      await registrarVehiculo(Object.fromEntries(new FormData(form)));
      aviso('Solicitud enviada. Te avisaremos cuando el administrador la revise.', 'ok');
      await mostrarSegunEstado();
    });
  }

  // --- Pendiente ----------------------------------------------------------------
  function enRevision(veh) {
    $('#panel').innerHTML = `
      <div class="estado-caja estado-caja--pendiente">
        <b>⏳ Tu vehículo está en revisión</b>
        <p>${esc(veh.tipo)} · placa <b>${esc(veh.placa)}</b> · ${esc(veh.marca)} ${esc(veh.modelo)}</p>
        <p>Cuando el administrador lo apruebe podrás iniciar tu turno.</p>
      </div>
      <button id="btn-revisar-estado" class="sec">↻ Ver si ya me aprobaron</button>`;
    $('#btn-revisar-estado').onclick = (e) => conCarga(e.target, mostrarSegunEstado);
  }

  // --- Suspendido -----------------------------------------------------------------
  function suspendido(veh) {
    $('#panel').innerHTML = `
      <div class="estado-caja estado-caja--rechazado">
        <b>⛔ Tu vehículo está suspendido</b>
        <p>Placa <b>${esc(veh.placa)}</b>. Motivo: ${esc(veh.motivo_revision)}</p>
        <p>Comunícate con el administrador para reactivarlo.</p>
      </div>`;
  }

  // --- Aprobado: turno de trabajo (lógica original) -------------------------------
  function turno(veh) {
    const esMinibus = veh.tipo === TipoTransporte.MINIBUS;
    $('#panel').innerHTML = `
      <div class="estado-caja estado-caja--aprobado"><b>✔ Vehículo aprobado</b> · ${esc(veh.tipo)} · ${esc(veh.placa)}</div>
      <button id="btn-turno">Iniciar turno</button><div id="cola"></div>`;
    let activo = false, watch = null, canales = [];

    $('#btn-turno').onclick = (e) => conCarga(e.target, async () => {
      activo = !activo;
      const { error } = await db.from('vehiculos').update({ disponible: activo }).eq('id', veh.id);
      if (error) { activo = !activo; throw new Error(error.message); }
      e.target.textContent = activo ? 'Terminar turno' : 'Iniciar turno';
      e.target.classList.toggle('sec', activo);
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
}
