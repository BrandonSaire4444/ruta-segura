import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG } from '../config.js';
export const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
// Lanza un error legible si Supabase responde con error.
export const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
