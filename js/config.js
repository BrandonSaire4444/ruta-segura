// Configuración central. Rellena tus credenciales de Supabase.
export const CONFIG = {
  SUPABASE_URL: 'https://qcthxkpjgkuzcfoyxtyq.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_7jtWzrK9cdD2l4ZCi8Kehw_e8ZkvpZX',
  UMBRAL_FACIAL: 0.5,        // distancia euclidiana máxima para considerar "mismo rostro"
  RADIO_MINIBUS_M: 300,      // un minibús "pasa cerca" si su ruta está a menos de esto del destino
  CENTRO: [-16.4897, -68.1193], // La Paz
  TARIFAS: { taxi: { base: 5, porKm: 2.5 }, moto: { base: 3, porKm: 1.8 }, minibus: { base: 1.5, porKm: 0 } }, // Bs
  RUTA_MODELOS_FACIALES: './modelos-face-api',
};
