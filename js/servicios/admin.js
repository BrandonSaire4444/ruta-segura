import { db, ok } from './cliente.js';
import { EstadoAprobacion } from '../nucleo/constantes.js';

/** Todos los vehículos con los datos de su conductor (CI y licencia solo llegan al admin). */
export async function listarVehiculos() {
  return ok(await db.rpc('admin_listar_vehiculos'));
}

/** Cambia el estado de aprobación. Rechazar y suspender exigen un motivo que verá el conductor. */
async function revisar(id, estado, motivo = null) {
  return ok(await db.rpc('admin_revisar_vehiculo', { p_vehiculo: id, p_estado: estado, p_motivo: motivo }));
}
export const aprobar = (id) => revisar(id, EstadoAprobacion.APROBADO);
export const rechazar = (id, motivo) => revisar(id, EstadoAprobacion.RECHAZADO, motivo);
export const suspender = (id, motivo) => revisar(id, EstadoAprobacion.SUSPENDIDO, motivo);
