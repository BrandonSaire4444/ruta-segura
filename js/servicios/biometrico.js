import { CONFIG } from '../config.js';
/* global faceapi */

/** Proveedor biométrico (face-api.js). Para cambiar de API, implementa la misma interfaz:
 *  cargarModelos(), extraerDescriptor(elemento) -> number[] | null */
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
  async extraerDescriptor(elemento) {
    await this.cargarModelos();
    const det = await faceapi
      .detectSingleFace(elemento, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(true).withFaceDescriptor();
    return det ? Array.from(det.descriptor) : null;
  }
}
export const biometrico = new FaceApiBiometrico();
