import { db, ok } from './cliente.js';
import { Vehiculo } from '../nucleo/dominio.js';

/** Vehículo del conductor que tiene la sesión abierta (o null si aún no registró uno). */
export async function miVehiculo(conductorId) {
  const fila = ok(await db.from('vehiculos').select('*').eq('conductor_id', conductorId).maybeSingle());
  return fila ? new Vehiculo(fila) : null;
}

/** Registra el vehículo (o lo corrige tras un rechazo). Queda "pendiente" hasta que el admin lo apruebe. */
export async function registrarVehiculo({ tipo, placa, marca, modelo, color, capacidad, linea, licencia }) {
  return ok(await db.rpc('registrar_vehiculo', {
    p_tipo: tipo, p_placa: placa, p_marca: marca, p_modelo: modelo, p_color: color,
    p_capacidad: capacidad ? Number(capacidad) : null, p_linea: linea || null, p_licencia: licencia,
  }));
}

/** Líneas de minibús disponibles para elegir al registrar un minibús. */
export async function listarLineas() {
  return ok(await db.from('lineas').select('id,numero,nombre,sindicatos(nombre)').order('numero'));
}
