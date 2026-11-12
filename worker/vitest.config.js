// Pruebas del Worker dentro del runtime de Workers (Miniflare, local, sin cuenta de Cloudflare).
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migraciones = await readD1Migrations(path.join(import.meta.dirname, 'migraciones'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Secretos solo de prueba: los de verdad se cargan con `wrangler secret put`.
          bindings: {
            SECRETO_IP: 'prueba-ip-0123456789abcdef',
            SECRETO_DISPOSITIVO: 'prueba-dispositivo-0123456789',
            SECRETO_PASE: 'prueba-pase-0123456789abcdef',
            SECRETO_BAJA: 'prueba-baja-0123456789abcdef',
            MIGRACIONES: migraciones,
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/preparar.js'] },
  };
});
