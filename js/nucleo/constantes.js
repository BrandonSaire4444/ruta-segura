export const TipoTransporte = Object.freeze({ MINIBUS: 'minibus', TAXI: 'taxi', MOTO: 'moto' });
export const Rol = Object.freeze({ PASAJERO: 'pasajero', CONDUCTOR: 'conductor', ADMIN: 'admin' });
export const EstadoViaje = Object.freeze({
  SOLICITADO: 'solicitado', ASIGNADO: 'conductor_asignado', EN_VERIFICACION: 'en_verificacion',
  EN_CURSO: 'en_curso', FINALIZADO: 'finalizado', CANCELADO: 'cancelado',
});
export const EstadoSolicitud = Object.freeze({ PENDIENTE: 'pendiente', ACEPTADA: 'aceptada', RECHAZADA_LLENO: 'rechazada_lleno' });
export const ResultadoVerificacion = Object.freeze({ COINCIDE: 'coincide', NO_COINCIDE: 'no_coincide', ERROR: 'error' });
export const EstadoAprobacion = Object.freeze({
  PENDIENTE: 'pendiente', APROBADO: 'aprobado', RECHAZADO: 'rechazado', SUSPENDIDO: 'suspendido',
});
