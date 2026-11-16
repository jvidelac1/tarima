// Materiales como FUNCIONES por píxel (Gráficos fase 3). Cada superficie es una función GLSL `superficie(P, col, rug, met)`
// que se inyecta en el material físico de three con onBeforeCompile: recibe la posición del píxel en el mundo (P, en metros)
// y lo que ya traía el material (color, rugosidad, metal: de sus texturas o de sus constantes), los cambia por capas y
// devuelve una altura; de la altura sale la normal (derivadas de pantalla). No hay texturas: el detalle no se pixela de cerca.
// Un valor compartido, `USO` (0 = sala recién armada, 1 = final de una jornada larga), gradúa magnesio, mugre y óxido en
// todas; lo sube el juego con cada barra que cae (look.js) y lo mueve el deslizador del laboratorio (lab.js).
// Solo con post (Media, Alta, Ultra): en el camino directo el piso va horneado y lo demás queda con sus texturas.
import * as THREE from 'three';

/** Desgaste compartido por todas las superficies (uniform). */
export const USO = { value: .45 };
const ESTADO = { on: true, mats: new Set() };

const COMUN = /* glsl */`
uniform float uUso; varying vec3 vSupP; float gSupAlt = 0.0; vec3 gSupLuz = vec3( 0.0 );
float sH( vec2 p ){ vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float sN( vec2 p ){ vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( sH( i ), sH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( sH( i + vec2( 0.0, 1.0 ) ), sH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
float sF( vec2 p ){ float v = 0.0, a = 0.5; for ( int i = 0; i < 4; i ++ ) { v += a * sN( p ); p = p * 2.03 + 17.1; a *= 0.5; } return v / 0.9375; }
// cuánto detalle de período 1/f (en metros) se resuelve en este píxel: 1 de cerca, 0 cuando entra más de medio período por píxel
float sVer( vec3 P, float f ){ return 1.0 - smoothstep( 0.2, 0.5, length( fwidth( P ) ) * f ); }
vec3 sNormal( vec3 N, vec3 vp, float h, float k ){
  vec3 dpx = dFdx( vp ), dpy = dFdy( vp ); float dhx = dFdx( h ), dhy = dFdy( h );
  vec3 r1 = cross( dpy, N ), r2 = cross( N, dpx ); float det = dot( dpx, r1 );
  return normalize( abs( det ) * N - k * sign( det ) * ( dhx * r1 + dhy * r2 ) );
}`;

/** Las superficies. Cada una: `float superficie( vec3 P, inout vec3 col, inout float rug, inout float met )` (devuelve la altura en metros aprox.). */
export const SUPERFICIES = {
  // Madera barnizada de la tarima, encima de sus mapas: veta fina a lo largo de z, microrrayas del barniz y magnesio en capas
  // (nube fina que se pega al barniz, grumos, y pisadas donde se para el pesista). El magnesio crece con el uso.
  madera: { k: .9, glsl: /* glsl */`
float superficie( vec3 P, inout vec3 col, inout float rug, inout float met ){
  vec2 p = P.xz; float v1 = sVer( P, 500.0 ), v2 = sVer( P, 60.0 );
  float hilo = sN( vec2( p.x * 900.0, p.y * 14.0 ) ) * 0.6 + sN( vec2( p.x * 320.0, p.y * 5.0 ) ) * 0.4;
  float raya = smoothstep( 0.86, 0.97, sN( vec2( p.x * 40.0 + p.y * 9.0, p.y * 420.0 ) ) ) * v1;
  col *= 1.0 + ( hilo - 0.5 ) * 0.22 * v1; rug = clamp( rug + ( hilo - 0.5 ) * 0.12 * v1 + raya * 0.25, 0.05, 1.0 );
  float centro = exp( - dot( p * vec2( 0.85, 1.25 ) - vec2( 0.0, 0.15 ), p * vec2( 0.85, 1.25 ) - vec2( 0.0, 0.15 ) ) ), discos = exp( - pow( ( abs( p.x ) - 0.97 ) / 0.22, 2.0 ) ) * ( 1.0 - smoothstep( 0.5, 1.1, abs( p.y - 0.1 ) ) );
  float nube = sF( p * 3.1 + 4.0 ), grumo = sF( p * 46.0 ) * v2 + 0.5 * ( 1.0 - v2 );
  float tiza = smoothstep( 0.62 - 0.24 * uUso, 0.97 - 0.2 * uUso, nube * ( 0.45 + 0.9 * centro + 0.6 * discos ) ) * ( 0.35 + 0.65 * smoothstep( 0.3, 0.7, grumo ) );
  tiza = clamp( tiza * ( 0.25 + 0.6 * uUso ), 0.0, 0.7 );
  col = mix( col, vec3( 0.86, 0.85, 0.80 ), tiza ); rug = mix( rug, 0.98, min( 1.0, tiza * 1.8 ) );
  return ( hilo * 0.00012 - raya * 0.0002 ) * v1 + tiza * grumo * 0.0006 * v2;
}` },
  // Goma del escenario, encima de sus mapas: gránulo de caucho prensado, polvo de magnesio que se junta con el uso y brillo de pisadas.
  goma: { k: 1.0, glsl: /* glsl */`
float superficie( vec3 P, inout vec3 col, inout float rug, inout float met ){
  vec2 p = P.xz; float v1 = sVer( P, 700.0 ), v2 = sVer( P, 50.0 );
  float gran = sN( p * 1100.0 ) * 0.6 + sN( p * 420.0 ) * 0.4;
  col *= 1.0 + ( gran - 0.5 ) * 0.5 * v1; rug = clamp( rug + ( gran - 0.5 ) * 0.2 * v1, 0.08, 1.0 );
  float cerca = exp( - pow( max( abs( p.x ), abs( p.y ) ) / 3.4, 4.0 ) );
  float polvo = smoothstep( 0.7 - 0.3 * uUso, 1.0 - 0.25 * uUso, sF( p * 1.7 + 9.0 ) * ( 0.55 + 0.6 * cerca ) ) * ( 0.5 + 0.5 * sF( p * 30.0 ) * v2 ) * ( 0.2 + 0.8 * uUso );
  col = mix( col, vec3( 0.55, 0.55, 0.53 ), polvo * 0.5 ); rug = mix( rug, 0.97, polvo );
  float pulido = smoothstep( 0.55, 0.8, sF( p * 0.9 + 2.0 ) ) * cerca; rug = mix( rug, rug * 0.62, pulido * ( 1.0 - polvo ) );
  return gran * 0.00025 * v1 + polvo * 0.0002;
}` },
  // Chapa trapezoidal pintada (pared del estadio), toda por función: las costillas son un coseno recortado; la pintura va en
  // capas: donde se descascara aparece la base anticorrosiva, lo más hondo llega al acero y el acero se oxida y chorrea;
  // arriba, vetas lavadas más claras; abajo, mugre. Tornillos en las juntas de cada paño. El óxido crece con el uso.
  chapa: { k: 1.0, glsl: /* glsl */`
uniform vec3 uChapa; uniform vec3 uBanio;
float superficie( vec3 P, inout vec3 col, inout float rug, inout float met ){
  float u = abs( dFdx( P.x ) ) + abs( dFdy( P.x ) ) > abs( dFdx( P.z ) ) + abs( dFdy( P.z ) ) ? P.x : P.z; vec2 p = vec2( u, P.y );
  float v1 = sVer( P, 12.0 ), v2 = sVer( P, 120.0 );
  float c = cos( p.x * 6.2832 / 0.25 ), costilla = smoothstep( -0.35, 0.35, c ), alt = costilla * 0.035 * v1;
  float panio = floor( p.x / 3.0 ), tono = 0.86 + 0.26 * sH( vec2( panio, floor( p.y / 6.0 ) ) );
  vec3 pintura = uChapa * tono * ( 0.9 + 0.2 * sF( p * vec2( 0.6, 2.5 ) ) );
  float lavado = smoothstep( 0.55, 0.85, sN( vec2( p.x * 5.0, p.y * 0.18 ) ) ) * smoothstep( 0.0, 6.0, p.y ); pintura = mix( pintura, pintura * 1.5 + 0.03, lavado * 0.5 );
  float desc = sF( p * vec2( 3.0, 2.2 ) + panio * 7.3 ) + ( sF( p * 23.0 ) - 0.5 ) * 0.3 * v2 + 0.12 * ( 1.0 - costilla ) + 0.22 * uUso - 0.1 * smoothstep( 0.0, 5.0, p.y );
  float base = smoothstep( 0.66, 0.69, desc ), acero = smoothstep( 0.76, 0.78, desc ), oxido = smoothstep( 0.72, 0.84, desc + ( sF( p * 9.0 ) - 0.5 ) * 0.2 );
  float chorro = smoothstep( 0.72, 0.9, sF( vec2( p.x * 7.0, p.y * 0.5 ) + panio ) * ( 0.6 + 0.6 * sF( p * vec2( 2.0, 0.3 ) ) ) ) * ( 0.4 + 0.6 * uUso );
  col = mix( pintura, vec3( 0.52, 0.30, 0.22 ), base ); col = mix( col, vec3( 0.42, 0.43, 0.45 ), acero );
  col = mix( col, mix( vec3( 0.30, 0.13, 0.05 ), vec3( 0.55, 0.27, 0.09 ), sF( p * 30.0 ) ), max( oxido, chorro * 0.75 ) );
  float mugre = ( 1.0 - smoothstep( 0.0, 1.6, p.y ) ) * ( 0.5 + 0.5 * sF( p * vec2( 2.0, 5.0 ) ) ); col *= 1.0 - 0.6 * mugre;
  rug = mix( 0.42 + 0.2 * sF( p * 6.0 ), 0.9, max( max( base * 0.6, oxido ), max( chorro, mugre ) ) ); rug = mix( rug, 0.34, acero * ( 1.0 - oxido ) ); met = acero * ( 1.0 - oxido ) * 0.9;
  vec2 q = vec2( fract( p.x / 0.25 ) - 0.5, fract( p.y / 1.5 ) - 0.5 ) * vec2( 0.25, 1.5 ); float tornillo = ( 1.0 - smoothstep( 0.008, 0.012, length( q ) ) ) * v2;
  col = mix( col, vec3( 0.5 ), tornillo * 0.7 ); float junta = ( 1.0 - smoothstep( 0.0, 0.02, abs( fract( p.x / 3.0 ) - 0.5 ) * 3.0 - 1.48 ) );
  col *= 1.0 - 0.5 * junta;
  // bañadores de pared arriba (uno cada 1,6 m): la chapa se ve aunque los focos apunten a la tarima
  gSupLuz = col * uBanio * exp( - max( 0.0, 5.4 - p.y ) * 0.55 ) * ( 0.45 + 0.55 * pow( 0.5 + 0.5 * cos( p.x * 6.2832 / 1.6 ), 3.0 ) ) * ( 0.75 + 0.25 * costilla );
  return alt - base * 0.0006 * v2 - acero * 0.0005 * v2 + oxido * 0.0012 * sF( p * 40.0 ) * v2 + tornillo * 0.004;
}` },
  // Goma de los discos, encima de su color: poro fino, roces brillantes en arco y magnesio de las manos que crece con el uso.
  disco: { k: .8, glsl: /* glsl */`
float superficie( vec3 P, inout vec3 col, inout float rug, inout float met ){
  float v1 = sVer( P, 900.0 ), v2 = sVer( P, 80.0 ); vec2 p = P.yz + P.x * 0.37;
  float poro = sN( p * 1500.0 ) * v1, polvo = smoothstep( 0.72 - 0.3 * uUso, 0.95 - 0.2 * uUso, sF( p * 9.0 ) ) * ( 0.4 + 0.6 * sF( p * 70.0 ) * v2 ) * ( 0.25 + 0.75 * uUso );
  col *= 1.0 + ( poro - 0.5 ) * 0.25; col = mix( col, vec3( 0.8, 0.79, 0.75 ), polvo * 0.55 );
  float roce = smoothstep( 0.6, 0.75, sF( p * vec2( 4.0, 40.0 ) ) ) * v2; rug = clamp( mix( rug - roce * 0.2, 0.98, polvo ) + ( poro - 0.5 ) * 0.15, 0.1, 1.0 );
  return poro * 0.00015 + polvo * 0.00025;
}` },
};

/**
 * Pone una superficie por función en un material físico (se encadena con el onBeforeCompile que ya tenga). `extra`: uniforms
 * propios (p. ej. `uChapa`, el color de la pintura). Se prende y se apaga para todos con setSuperficies (cambia programas).
 */
export function conSuperficie(m, tipo, extra = {}) {
  const S = SUPERFICIES[tipo]; if (!m || !m.isMeshStandardMaterial || !S || m.userData.superficie) return m;
  m.userData.superficie = tipo; ESTADO.mats.add(m);
  const antes = m.onBeforeCompile, clave = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    antes.call(this, sh, r); if (!ESTADO.on) return;
    Object.assign(sh.uniforms, { uUso: USO }, extra);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSupP;').replace('#include <project_vertex>', '#include <project_vertex>\n\tvSupP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + COMUN + S.glsl)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tgSupAlt = superficie( vSupP, diffuseColor.rgb, roughnessFactor, metalnessFactor );')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n\tnormal = sNormal( normal, - vViewPosition, gSupAlt, ${S.k.toFixed(2)} );`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += gSupLuz;');
  };
  m.customProgramCacheKey = function () { return clave.call(this) + (ESTADO.on ? '|sup:' + tipo : ''); };
  m.needsUpdate = true; return m;
}
/** Prende o apaga las superficies por función en todos los materiales que las tienen (recompila: solo en la carga). */
export function setSuperficies(on) { on = !!on; if (on === ESTADO.on) return; ESTADO.on = on; for (const m of ESTADO.mats) m.needsUpdate = true; }
/** Material de chapa pintada para paredes (`color`: la pintura). */
export function chapa(color = '#2b4250', banio = '#ffd9a8', fuerza = .9) {
  const m = new THREE.MeshStandardMaterial({ name: 'chapa', color: new THREE.Color(color), roughness: .5, metalness: 0, envMapIntensity: .6 });
  return conSuperficie(m, 'chapa', { uChapa: { value: new THREE.Color(color) }, uBanio: { value: new THREE.Color(banio).multiplyScalar(fuerza) } });
}
