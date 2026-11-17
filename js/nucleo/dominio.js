import { EstadoViaje, TipoTransporte, EstadoAprobacion } from './constantes.js';

export class Vehiculo {
  constructor(f) { Object.assign(this, f); }
  get ubicacion() { return [this.lat, this.lng]; }
  /** Solo un vehículo aprobado por el administrador puede trabajar. */
  estaAprobado() { return this.estado_aprobacion === EstadoAprobacion.APROBADO; }
  /** Datos que ve el pasajero para evitar estafas o suplantaciones. */
  datosSeguridad() {
    return { tipo: this.tipo, placa: this.placa, marca: this.marca, modelo: this.modelo, color: this.color };
  }
}

export class Minibus extends Vehiculo {
  hayCupo() { return this.asientos_ocupados < this.capacidad; }
}

export class Viaje {
  constructor(f) { Object.assign(this, f); }
  get origen() { return [this.origen_lat, this.origen_lng]; }
  get destino() { return [this.destino_lat, this.destino_lng]; }
  /** Taxi y moto solo inician con el conductor verificado. */
  puedeIniciar() {
    return this.tipo !== TipoTransporte.MINIBUS && this.verificado === true && this.estado === EstadoViaje.EN_VERIFICACION;
  }
}
