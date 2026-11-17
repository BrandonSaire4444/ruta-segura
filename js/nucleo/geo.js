// Utilidades geográficas. Coordenada = [lat, lng].
const R = 6371000;
const rad = (g) => (g * Math.PI) / 180;

export function distanciaMetros(a, b) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distancia mínima (m) de un punto a un trazado, proyectando sobre cada segmento. */
export function distanciaARuta(p, trazado) {
  if (trazado.length === 1) return distanciaMetros(p, trazado[0]);
  const m = 111320, k = Math.cos(rad(p[0]));
  const xy = (c) => [(c[1] - p[1]) * m * k, (c[0] - p[0]) * m];
  let min = Infinity;
  for (let i = 0; i < trazado.length - 1; i++) {
    const [ax, ay] = xy(trazado[i]), [bx, by] = xy(trazado[i + 1]);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}
