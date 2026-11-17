import { $, esc, aviso, conCarga } from './utilidades.js';
import { listarVehiculos, aprobar, rechazar, suspender } from '../servicios/admin.js';
import { EstadoAprobacion } from '../nucleo/constantes.js';

const ICONO = { minibus: '🚐', taxi: '🚕', moto: '🏍️' };
const FILTROS = [
  { id: EstadoAprobacion.PENDIENTE, texto: 'Pendientes' },
  { id: EstadoAprobacion.APROBADO, texto: 'Aprobados' },
  { id: EstadoAprobacion.RECHAZADO, texto: 'Rechazados' },
  { id: EstadoAprobacion.SUSPENDIDO, texto: 'Suspendidos' },
  { id: 'todos', texto: 'Todos' },
];
const fecha = (f) => (f ? new Date(f).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Panel del administrador: revisa y aprueba a los conductores con su vehículo (minibús, taxi y moto). */
export async function montarAdmin() {
  document.body.classList.add('modo-admin');
  const panel = $('#panel');
  panel.innerHTML = `
    <div class="adm-cabecera">
      <div>
        <h2>Aprobación de conductores</h2>
        <p class="adm-sub">Revisa los datos del conductor y su vehículo antes de dejarlo trabajar.</p>
      </div>
      <button id="adm-recargar" class="sec">↻ Actualizar</button>
    </div>
    <div id="adm-filtros" class="adm-filtros"></div>
    <div class="adm-herramientas">
      <input id="adm-buscar" type="search" placeholder="Buscar por placa, nombre, CI o licencia">
      <select id="adm-tipo">
        <option value="">Todos los vehículos</option>
        <option value="minibus">🚐 Minibús</option>
        <option value="taxi">🚕 Taxi</option>
        <option value="moto">🏍️ Moto</option>
      </select>
    </div>
    <div id="adm-lista" class="adm-lista"><p class="adm-vacio">Cargando…</p></div>`;

  let datos = [], filtro = EstadoAprobacion.PENDIENTE;

  async function cargar() {
    datos = await listarVehiculos();
    pintar();
  }

  function pintar() {
    const cuenta = (id) => (id === 'todos' ? datos.length : datos.filter((v) => v.estado_aprobacion === id).length);
    $('#adm-filtros').innerHTML = FILTROS.map((f) => `
      <button data-filtro="${f.id}" class="${f.id === filtro ? 'activo' : ''}">
        ${f.texto} <span class="adm-contador">${cuenta(f.id)}</span>
      </button>`).join('');
    $('#adm-filtros').querySelectorAll('[data-filtro]').forEach((b) => (b.onclick = () => { filtro = b.dataset.filtro; pintar(); }));

    const texto = $('#adm-buscar').value.trim().toLowerCase();
    const tipo = $('#adm-tipo').value;
    const lista = datos
      .filter((v) => filtro === 'todos' || v.estado_aprobacion === filtro)
      .filter((v) => !tipo || v.tipo === tipo)
      .filter((v) => !texto || [v.placa, v.conductor_nombre, v.conductor_ci, v.conductor_licencia]
        .some((x) => String(x ?? '').toLowerCase().includes(texto)));

    $('#adm-lista').innerHTML = lista.length
      ? lista.map(tarjeta).join('')
      : `<p class="adm-vacio">${filtro === EstadoAprobacion.PENDIENTE ? '✅ No hay solicitudes pendientes.' : 'No hay vehículos en esta lista.'}</p>`;
    $('#adm-lista').querySelectorAll('.adm-tarjeta').forEach(enlazarAcciones);
  }

  function tarjeta(v) {
    const conductor = v.conductor_id
      ? `<dl class="adm-datos">
           <dt>Conductor</dt><dd><b>${esc(v.conductor_nombre)}</b> <span class="estado estado--aprobado">✔ rostro verificado</span></dd>
           <dt>Carnet (CI)</dt><dd>${esc(v.conductor_ci)}</dd>
           <dt>Licencia</dt><dd>${esc(v.conductor_licencia) || '—'}</dd>
           <dt>Teléfono</dt><dd>${esc(v.conductor_telefono) || '—'}</dd>
         </dl>`
      : '<p class="adm-sin-conductor">Sin conductor asignado (vehículo cargado desde la base de datos).</p>';
    const linea = v.tipo === 'minibus'
      ? `<dt>Línea</dt><dd>${esc(v.linea_numero) || '—'} · ${esc(v.sindicato) || 'sin sindicato'}</dd>` : '';
    const motivo = v.motivo_revision ? `<p class="adm-motivo-actual">Motivo: ${esc(v.motivo_revision)}</p>` : '';

    return `
      <article class="adm-tarjeta" data-id="${v.id}">
        <div class="adm-tarjeta__cabeza">
          <span class="adm-icono">${ICONO[v.tipo] || '🚗'}</span>
          <div>
            <h3>${esc(v.placa)}</h3>
            <p>${esc(v.marca)} ${esc(v.modelo)} · ${esc(v.color)}</p>
          </div>
          <span class="estado estado--${v.estado_aprobacion}">${esc(v.estado_aprobacion)}</span>
        </div>
        <dl class="adm-datos">
          <dt>Tipo</dt><dd>${esc(v.tipo)} · ${esc(v.capacidad)} ${v.capacidad == 1 ? 'pasajero' : 'pasajeros'}</dd>
          ${linea}
          <dt>Solicitado</dt><dd>${fecha(v.creado_en)}</dd>
          ${v.revisado_en ? `<dt>Revisado</dt><dd>${fecha(v.revisado_en)}</dd>` : ''}
        </dl>
        ${conductor}
        ${motivo}
        <div class="adm-acciones">${botones(v.estado_aprobacion)}</div>
        <div class="adm-motivo" hidden>
          <input placeholder="Motivo (lo verá el conductor)" maxlength="200">
          <div class="adm-acciones">
            <button data-confirmar>Confirmar</button>
            <button data-cancelar class="sec">Cancelar</button>
          </div>
        </div>
      </article>`;
  }

  function botones(estado) {
    switch (estado) {
      case EstadoAprobacion.PENDIENTE:
        return '<button data-accion="aprobar">✔ Aprobar</button><button data-accion="rechazar" class="peligro">✖ Rechazar</button>';
      case EstadoAprobacion.APROBADO:
        return '<button data-accion="suspender" class="peligro">Suspender</button>';
      case EstadoAprobacion.RECHAZADO:
        return '<button data-accion="aprobar">✔ Aprobar de todos modos</button>';
      case EstadoAprobacion.SUSPENDIDO:
        return '<button data-accion="aprobar">Reactivar</button>';
      default: return '';
    }
  }

  function enlazarAcciones(el) {
    const id = el.dataset.id;
    const caja = $('.adm-motivo', el);
    let accionPendiente = null;

    el.querySelectorAll('[data-accion]').forEach((b) => (b.onclick = () => {
      if (b.dataset.accion === 'aprobar') {
        return conCarga(b, async () => { await aprobar(id); aviso('Vehículo aprobado. El conductor ya puede trabajar.', 'ok'); await cargar(); });
      }
      accionPendiente = b.dataset.accion;      // rechazar o suspender: primero pedir el motivo
      caja.hidden = false;
      $('input', caja).focus();
    }));

    $('[data-cancelar]', caja).onclick = () => { caja.hidden = true; accionPendiente = null; };
    $('[data-confirmar]', caja).onclick = (e) => conCarga(e.target, async () => {
      const motivo = $('input', caja).value.trim();
      if (motivo.length < 5) throw new Error('Escribe un motivo claro (mínimo 5 letras).');
      await (accionPendiente === 'suspender' ? suspender(id, motivo) : rechazar(id, motivo));
      aviso(accionPendiente === 'suspender' ? 'Vehículo suspendido.' : 'Solicitud rechazada.', 'ok');
      await cargar();
    });
  }

  $('#adm-buscar').oninput = pintar;
  $('#adm-tipo').onchange = pintar;
  $('#adm-recargar').onclick = (e) => conCarga(e.target, cargar);
  await cargar();
}
