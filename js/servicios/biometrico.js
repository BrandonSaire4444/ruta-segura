import { CONFIG } from '../config.js';
/* global faceapi */

/** Proveedor biométrico (face-api.js). Para cambiar de API, implementa la misma interfaz:
 *  cargarModelos(), extraerDescriptor(fuente) -> number[] | null
 *  `fuente` puede ser una imagen/canvas/video o un ARREGLO de ellos (se promedian los descriptores:
 *  así una foto movida o con mala luz no arruina la comparación). */
export class FaceApiBiometrico {
  #listo = false;
  async cargarModelos() {
    if (this.#listo) return;
    const r = CONFIG.RUTA_MODELOS_FACIALES;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(r),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(r),
      faceapi.nets.faceRecognitionNet.loadFromUri(r),
    ]);
    this.#listo = true;
  }
  async #descriptorDe(elemento) {
    const opciones = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
    const det = await faceapi.detectSingleFace(elemento, opciones).withFaceLandmarks(true).withFaceDescriptor();
    if (!det) return null;
    const d = Array.from(det.descriptor);
    // Si los modelos están dañados salen NaN: se rechaza en vez de guardar un rostro inválido.
    if (d.length !== 128 || d.some((x) => !Number.isFinite(x))) {
      throw new Error('Los modelos faciales están dañados o incompletos. Reemplaza la carpeta modelos-face-api.');
    }
    return d;
  }
  async extraerDescriptor(fuente) {
    await this.cargarModelos();
    const fotos = Array.isArray(fuente) ? fuente : [fuente];
    const validos = [];
    for (const f of fotos) { const d = await this.#descriptorDe(f); if (d) validos.push(d); }
    if (!validos.length) return null;
    return validos[0].map((_, i) => validos.reduce((s, d) => s + d[i], 0) / validos.length);
  }
}
export const biometrico = new FaceApiBiometrico();
