import { CONFIG } from '../config.js';
/* global L */
export class Mapa {
  constructor(id) {
    this.m = L.map(id).setView(CONFIG.CENTRO, 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(this.m);
    this.capa = L.layerGroup().addTo(this.m); this.destino = null; this.yo = null;
  }
  alTocar(fn) { this.m.on('click', (e) => fn([e.latlng.lat, e.latlng.lng])); }
  ponerDestino(c) { this.destino?.remove(); this.destino = L.marker(c).addTo(this.m).bindPopup('Destino'); }
  ponerYo(c) { this.yo?.remove(); this.yo = L.circleMarker(c, { radius: 8 }).addTo(this.m); this.m.setView(c, 15); }
  limpiar() { this.capa.clearLayers(); }
  marcar(c, texto) { return L.marker(c).addTo(this.capa).bindPopup(texto); }
  trazar(ruta) { return L.polyline(ruta, { weight: 4 }).addTo(this.capa); }
  ubicarme() {
    return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(
      (p) => res([p.coords.latitude, p.coords.longitude]), () => rej(new Error('No se pudo obtener tu GPS.')), { enableHighAccuracy: true }));
  }
}
