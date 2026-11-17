import { $, esc, aviso, conCarga } from './utilidades.js';
import { abrirCamara, tomarFoto } from './camara.js';
import { Mapa } from './mapa.js';
import { TipoTransporte, EstadoViaje, EstadoSolicitud, ResultadoVerificacion } from '../nucleo/constantes.js';
import { buscarOpciones, solicitarAbordaje, escucharRespuesta } from '../servicios/minibus.js';
import * as Viajes from '../servicios/viajes.js';
import { db, ok } from '../servicios/cliente.js';
import { calcularTarifa } from '../servicios/tarifa.js';
import { distanciaMetros } from '../nucleo/geo.js';

export async function montarPasajero() {
  const mapa = new Mapa('mapa');
  let tipo = TipoTransporte.MINIBUS, destino = null, origen = null, viaje = null;
  try { origen = await mapa.ubicarme(); mapa.ponerYo(origen); } catch (e) { aviso(e.message, 'error'); }

  document.querySelectorAll('[data-tipo]').forEach((b) => (b.onclick = () => {
    tipo = b.dataset.tipo;
    document.querySelectorAll('[data-tipo]').forEach((x) => x.classList.toggle('activo', x === b));
  }));
  mapa.alTocar((c) => { destino = c; mapa.ponerDestino(c); $('#panel').innerHTML = '<p>Destino marcado. Pulsa “Buscar”.</p>'; });

  $('#btn-buscar').onclick = (e) => conCarga(e.target, async () => {
    if (!destino) throw new Error('Toca el mapa para elegir tu destino.');
    if (!origen) throw new Error('Necesitamos tu ubicación GPS.');
    tipo === TipoTransporte.MINIBUS ? await flujoMinibus() : await flujoIndividual();
  });

  async function flujoMinibus() {
    const r = await buscarOpciones(destino);
    mapa.limpiar();
    if (r.modo === 'parada') {
      if (!r.parada) return ($('#panel').innerHTML = '<p>No hay paradas registradas.</p>');
      mapa.marcar([r.parada.lat, r.parada.lng], r.parada.nombre).openPopup();
      $('#panel').innerHTML = `<h3>Ningún minibús pasa por ahí</h3><p>Parada más cercana: <b>${esc(r.parada.nombre)}</b> (${Math.round(r.parada.metros)} m de tu destino). Línea ${esc(r.parada.lineas?.numero)} · ${esc(r.parada.lineas?.sindicatos?.nombre)}.</p>`;
      return;
    }
    r.lineas.forEach((l) => mapa.trazar(l.ruta));
    const nombreLinea = (id) => r.lineas.find((l) => l.id === id);
    $('#panel').innerHTML = '<h3>Minibuses cercanos</h3>' + (r.minibuses.map((m) => {
      mapa.marcar(m.ubicacion, `Placa ${m.placa}`);
      const l = nombreLinea(m.linea_id);
      return `<div class="tarjeta"><b>Línea ${esc(l?.numero)}</b> · ${esc(l?.sindicatos?.nombre)}<br>Placa: <b>${esc(m.placa)}</b> · ${esc(m.color)}<br>Cupo: ${m.hayCupo() ? 'disponible' : 'lleno'} · ${Math.round(distanciaMetros(origen, m.ubicacion))} m de ti
        <button data-sol="${m.id}">Solicitar</button></div>`;
    }).join('') || '<p>Sin minibuses activos ahora en esas líneas.</p>');
    $('#panel').querySelectorAll('[data-sol]').forEach((b) => (b.onclick = () => conCarga(b, async () => {
      const s = await solicitarAbordaje(b.dataset.sol);
      aviso('Solicitud enviada al conductor…');
      escucharRespuesta(s.id, (n) => aviso(n.estado === EstadoSolicitud.ACEPTADA ? '✅ El conductor aceptó. ¡Espéralo en tu parada!' : `❌ ${n.mensaje || 'Minibús lleno'}`, n.estado === EstadoSolicitud.ACEPTADA ? 'ok' : 'error'));
    })));
  }

  async function flujoIndividual() {
    const km = distanciaMetros(origen, destino) / 1000;
    viaje = await Viajes.solicitarViaje({ tipo, origen, destino });
    $('#panel').innerHTML = `<p>Buscando ${esc(tipo)}… Tarifa estimada <b>Bs ${calcularTarifa(tipo, km)}</b></p>`;
    Viajes.escucharViaje(viaje.id, async (v) => { viaje = v; await pintarViaje(); });
  }

  async function pintarViaje() {
    const p = $('#panel');
    if (viaje.estado === EstadoViaje.ASIGNADO || viaje.estado === EstadoViaje.EN_VERIFICACION) {
      const veh = ok(await db.from('vehiculos').select('placa,marca,modelo,color,tipo').eq('id', viaje.vehiculo_id).single());
      p.innerHTML = `<h3>Conductor en camino</h3><div class="tarjeta">Placa <b>${esc(veh.placa)}</b> · ${esc(veh.marca)} ${esc(veh.modelo)} · ${esc(veh.color)}</div>
        ${viaje.estado === EstadoViaje.EN_VERIFICACION ? '<p>El conductor llegó. Toma su foto para verificarlo.</p><video id="video-ver" playsinline muted></video><button id="btn-ver">Verificar conductor</button>' : '<p>Aguarda a que llegue.</p>'}`;
      if (viaje.estado === EstadoViaje.EN_VERIFICACION) {
        const detener = await abrirCamara($('#video-ver'), false);
        $('#btn-ver').onclick = (e) => conCarga(e.target, async () => {
          const r = await Viajes.verificarConductor(viaje, tomarFoto($('#video-ver')));
          aviso(r.mensaje, r.resultado === ResultadoVerificacion.COINCIDE ? 'ok' : 'error');
          if (r.resultado === ResultadoVerificacion.COINCIDE) {
            detener(); viaje.verificado = true;
            p.innerHTML = '<p>✅ Conductor verificado.</p><button id="btn-ini">Iniciar viaje</button>';
            $('#btn-ini').onclick = (ev) => conCarga(ev.target, async () => { await Viajes.iniciarViaje(viaje); });
          }
        });
      }
    } else if (viaje.estado === EstadoViaje.EN_CURSO) p.innerHTML = '<h3>Viaje en curso 🚗</h3>';
    else if (viaje.estado === EstadoViaje.FINALIZADO) p.innerHTML = '<h3>Viaje finalizado. ¡Gracias!</h3>';
  }
}
