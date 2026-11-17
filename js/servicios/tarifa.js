import { CONFIG } from '../config.js';
export function calcularTarifa(tipo, km) {
  const t = CONFIG.TARIFAS[tipo];
  return Math.round((t.base + t.porKm * km) * 2) / 2; // redondeo a 0.5 Bs
}
