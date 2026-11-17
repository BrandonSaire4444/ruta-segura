/** Abre la cámara en un <video> y devuelve un <canvas> con la foto tomada. */
export async function abrirCamara(video, frontal = true) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: frontal ? 'user' : 'environment' } });
  video.srcObject = stream; await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());
}
export function tomarFoto(video) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  return c;
}
