// /api/* → Worker «tarima» (cuenta de finales, lista de espera, encuesta, baja).
import { reenviar } from '../_reenviar.js';
export const onRequest = reenviar;
