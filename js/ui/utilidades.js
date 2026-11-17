export const $ = (s, r = document) => r.querySelector(s);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function aviso(texto, tipo = 'info') {
  const el = $('#aviso'); el.textContent = texto; el.className = 'aviso ' + tipo; el.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (el.hidden = true), 6000);
}
export async function conCarga(boton, fn) {
  boton.disabled = true;
  try { return await fn(); } catch (e) { aviso(e.message, 'error'); } finally { boton.disabled = false; }
}
