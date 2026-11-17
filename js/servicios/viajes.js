import { db, ok } from './cliente.js';
import { Viaje } from '../nucleo/dominio.js';
import { EstadoViaje, ResultadoVerificacion } from '../nucleo/constantes.js';
import { distanciaMetros } from '../nucleo/geo.js';
import { calcularTarifa } from './tarifa.js';
import { biometrico } from './biometrico.js';

export async function solicitarViaje({ tipo, origen, destino }) {
  const { data: { user } } = await db.auth.getUser();
  const tarifa = calcularTarifa(tipo, distanciaMetros(origen, destino) / 1000);
  const fila = ok(await db.from('viajes').insert({
    pasajero_id: user.id, tipo, tarifa, estado: EstadoViaje.SOLICITADO,
    origen_lat: origen[0], origen_lng: origen[1], destino_lat: destino[0], destino_lng: destino[1],
  }).select().single());
  return new Viaje(fila);
}

/** Conductor acepta; el vehículo se toma del conductor. */
export async function aceptarViaje(viajeId, vehiculoId) {
  const { data: { user } } = await db.auth.getUser();
  return ok(await db.from('viajes').update({ conductor_id: user.id, vehiculo_id: vehiculoId, estado: EstadoViaje.ASIGNADO })
    .eq('id', viajeId).eq('estado', EstadoViaje.SOLICITADO).select().single());
}
export const conductorLlego = (id) => db.from('viajes').update({ estado: EstadoViaje.EN_VERIFICACION }).eq('id', id);

/** El pasajero fotografía al conductor; el servidor compara con el descriptor guardado. */
export async function verificarConductor(viaje, fotoEl) {
  const descriptor = await biometrico.extraerDescriptor(fotoEl);
  if (!descriptor) return { resultado: ResultadoVerificacion.ERROR, mensaje: 'No se detectó rostro.' };
  const r = ok(await db.rpc('verificar_conductor_viaje', { p_viaje: viaje.id, p_descriptor: descriptor }));
  return r.coincide
    ? { resultado: ResultadoVerificacion.COINCIDE, mensaje: 'Conductor verificado. Puedes iniciar el viaje.' }
    : { resultado: ResultadoVerificacion.NO_COINCIDE, mensaje: '⚠️ ¡Este NO es el conductor registrado! No abordes y reporta.' };
}

export async function iniciarViaje(viaje) {
  if (!viaje.puedeIniciar()) throw new Error('El conductor aún no está verificado.');
  return ok(await db.from('viajes').update({ estado: EstadoViaje.EN_CURSO }).eq('id', viaje.id).select().single());
}
export const finalizarViaje = (id) => db.from('viajes').update({ estado: EstadoViaje.FINALIZADO }).eq('id', id);
export const cancelarViaje = (id) => db.from('viajes').update({ estado: EstadoViaje.CANCELADO }).eq('id', id);

export function escucharViaje(id, alCambiar) {
  return db.channel('viaje-' + id).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'viajes', filter: `id=eq.${id}` },
    (p) => alCambiar(new Viaje(p.new))).subscribe();
}
export function escucharViajesNuevos(alRecibir) {
  return db.channel('viajes-nuevos').on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'viajes' }, (p) => alRecibir(new Viaje(p.new))).subscribe();
}
export async function historial() {
  return ok(await db.from('viajes').select('*').order('created_at', { ascending: false }).limit(30));
}
