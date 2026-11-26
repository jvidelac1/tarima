import { cutShader } from './singlet.js';
import { landmarks } from './landmarks.js';
// Las coordenadas del rostro siguen la malla aunque se muevan la cabeza y la cámara.
export function applyPortrait(material, texture, tall, eye = false) {
  const original = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    original.call(material, shader);
    shader.uniforms.portrait = { value: texture };
    shader.uniforms.portraitEffort = material.userData.portraitEffort ??= { value: 0 };
    shader.vertexShader =
      'varying vec3 bindPoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n bindPoint=position;'
      );
    shader.fragmentShader =
      (eye ? '' : cutShader(landmarks[tall ? 'brenner' : 'ventura']) + '\n') +
      'uniform float portraitEffort; uniform sampler2D portrait;varying vec3 bindPoint;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      vec3 p=bindPoint;
      ${eye ? '' : `if(fabricCut(p)>.0024)discard;`}
      ${tall ? 'p=vec3(p.x*.965,(p.y-1.72172)*.969+1.58933,(p.z-.13217)*.965+.12621);' : ''}
      ${
        eye
          ? ''
          : `
        // A patch of cheek from this athlete supplies pigment and fine texture.
        // Mix in the original body map at low frequency to retain anatomical colour.
        vec2 tile=1.-abs(2.*fract(vMapUv*6.7)-1.);
        vec2 cheek=vec2(.155,.405)+tile*vec2(.045,.065);
        vec3 photo=texture2D(portrait,cheek).rgb;
        vec3 average=textureLod(portrait,cheek,4.5).rgb;
        vec3 pore=clamp(photo/max(average,vec3(.018)),vec3(.70),vec3(1.28));
        float flesh=smoothstep(.42,.88,gMask.r);
        vec3 skin=mix(diffuseColor.rgb,average,.63)*mix(vec3(1.),pore,.72);
        diffuseColor.rgb=mix(diffuseColor.rgb,skin,flesh);
        // The original GLB has a painted singlet. Replace the narrow painted
        // edges exposed by the new, separately tailored armholes and neckline.
        if(p.y>1.10 && p.y<1.50 && abs(p.x)<.255) {
          float foundation=smoothstep(.20,.82,gMask.g);
          diffuseColor.rgb=mix(diffuseColor.rgb,photo*vec3(.94,.96,.98),foundation);
        }
      `
      }
      if(p.y>1.429 && abs(p.x)<.123 && p.z>-.037){
      float h=clamp((p.y-1.564)/.304+.5,.001,.999);
      vec2 front=vec2((.5+p.x/.304)*.5,h+.0055);
      vec2 side=vec2((1.5-(p.z-.057)/.304)*.5,h);
      float profile=max(smoothstep(.037,.080,abs(p.x))*(1.-smoothstep(.097,.147,p.z)),1.-smoothstep(.031,.075,p.z));
      vec3 portraitColor=mix(texture2D(portrait,front).rgb,texture2D(portrait,side).rgb,profile);
      float jaw=smoothstep(1.432,1.485,p.y)*(1.-smoothstep(.085,.115,abs(p.x)));
      float rear=smoothstep(-.035,.004,p.z);
      jaw*=mix(smoothstep(1.492,1.52,p.y),1.,smoothstep(.022,.089,p.z));
      ${eye ? 'jaw=1.;profile=0.;portraitColor=texture2D(portrait,front).rgb;' : ''}
      float cheekFlush=exp(-pow((abs(p.x)-.043)/.027,2.)-pow((p.y-1.552)/.028,2.))*smoothstep(.063,.109,p.z);
      portraitColor*=vec3(1.+.055*portraitEffort*cheekFlush,1.-.066*portraitEffort*cheekFlush,1.-.045*portraitEffort*cheekFlush);
      diffuseColor.rgb=mix(diffuseColor.rgb,portraitColor*.92,jaw*rear);
      }
    `
      );
  };
  material.customProgramCacheKey = () => 'portrait-studio-' + Number(tall) + '-' + Number(eye);
  material.needsUpdate = true;
}
