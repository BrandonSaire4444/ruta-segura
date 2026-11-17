import { db, ok } from './cliente.js';
import { CONFIG } from '../config.js';
import { Minibus } from '../nucleo/dominio.js';
import { distanciaARuta, distanciaMetros } from '../nucleo/geo.js';
import { EstadoSolicitud } from '../nucleo/constantes.js';

/** Minibuses activos cuya línea pasa cerca del destino; si ninguna, la parada más cercana. */
export async function buscarOpciones(destino) {
  const lineas = ok(await db.from('lineas').select('id,numero,nombre,ruta,sindicatos(nombre)'));
  const cercanas = lineas.filter((l) => distanciaARuta(destino, l.ruta) <= CONFIG.RADIO_MINIBUS_M);
  if (cercanas.length) {
    const ids = cercanas.map((l) => l.id);
    const vehs = ok(await db.from('vehiculos').select('*').eq('tipo', 'minibus').eq('disponible', true).in('linea_id', ids));
    return { modo: 'minibuses', lineas: cercanas, minibuses: vehs.map((v) => new Minibus(v)) };
  }
  const paradas = ok(await db.from('paradas').select('id,nombre,lat,lng,lineas(numero,sindicatos(nombre))'));
  const parada = paradas
    .map((p) => ({ ...p, metros: distanciaMetros(destino, [p.lat, p.lng]) }))
    .sort((a, b) => a.metros - b.metros)[0] || null;
  return { modo: 'parada', parada };
}

export async function solicitarAbordaje(vehiculoId) {
  const { data: { user } } = await db.auth.getUser();
  return ok(await db.from('solicitudes_minibus')
    .insert({ pasajero_id: user.id, vehiculo_id: vehiculoId, estado: EstadoSolicitud.PENDIENTE })
    .select().single());
}

/** El conductor responde: acepta, o rechaza por lleno con mensaje. */
export async function responderSolicitud(id, aceptar, mensaje = 'Minibús lleno') {
  const estado = aceptar ? EstadoSolicitud.ACEPTADA : EstadoSolicitud.RECHAZADA_LLENO;
  return ok(await db.from('solicitudes_minibus').update({ estado, mensaje: aceptar ? null : mensaje }).eq('id', id).select().single());
}

export function escucharSolicitudes(vehiculoId, alRecibir) {
  return db.channel('sol-' + vehiculoId).on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'solicitudes_minibus', filter: `vehiculo_id=eq.${vehiculoId}` },
    (p) => alRecibir(p.new)).subscribe();
}
export function escucharRespuesta(id, alRecibir) {
  return db.channel('resp-' + id).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'solicitudes_minibus', filter: `id=eq.${id}` },
    (p) => alRecibir(p.new)).subscribe();
}
