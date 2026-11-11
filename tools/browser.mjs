// Navegador de las pruebas del visor: dónde está Chrome y con qué backend de WebGL se abre, según la plataforma.
//   CHROME_PATH    ruta al ejecutable. Sin la variable se prueban las rutas habituales de cada sistema.
//   TARIMA_ANGLE   valor de --use-angle (metal, swiftshader, gl-egl, vulkan...). Por defecto: metal en macOS; en Linux
//                  swiftshader (WebGL por software) si la máquina no tiene GPU, y lo que elija Chrome si la tiene.
// macOS conserva exactamente los flags de siempre. Linux sin GPU (pod, contenedor, CI) dibuja con SwiftShader: sirve para
// lógica, consola, 404 y capturas; los fps no dicen nada del visor (ver isSoftware).
import fs from 'node:fs';

const CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
  win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
};
export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const c = CANDIDATES[process.platform] || [];
  return c.find(p => fs.existsSync(p)) || c[0];      // si no hay ninguno, el error de lanzamiento nombra la ruta esperada
}
const linuxHasGpu = () => { try { return fs.existsSync('/dev/nvidia0') || fs.readdirSync('/dev/dri').some(f => f.startsWith('renderD')); } catch { return false; } };
export function angleBackend() {
  if (process.env.TARIMA_ANGLE) return process.env.TARIMA_ANGLE;
  if (process.platform === 'darwin') return 'metal';
  if (process.platform === 'linux' && !linuxHasGpu()) return 'swiftshader';
  return null;
}
export function launchOptions({ headed = false } = {}) {
  const angle = angleBackend(), args = [];
  if (angle) args.push(`--use-angle=${angle}`);
  if (angle === 'swiftshader') args.push('--enable-unsafe-swiftshader');      // Chrome ya no cae solo a WebGL por software: hay que pedirlo
  args.push('--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--mute-audio');
  if (process.platform === 'linux') args.push('--disable-dev-shm-usage');     // /dev/shm de 64 MB en contenedores
  return { executablePath: chromePath(), headless: !headed, args };
}
// ¿El contexto WebGL salió por software? Se decide con el nombre real del renderizador (UNMASKED_RENDERER_WEBGL), no con los flags.
export const isSoftware = renderer => /swiftshader|llvmpipe|softpipe|software/i.test(renderer || '');
