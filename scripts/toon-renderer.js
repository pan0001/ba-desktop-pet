/** Local cel-shading + thin animated silhouette pass. No cloned meshes/bones. */
import * as THREE from '../assets/vendor/three/three.module.min.js';

export const TOON_STYLE = Object.freeze({outlineWidth:1.05,outlineOpacity:.78,brightness:1.025});
export const OUTLINE_PROFILES = Object.freeze({
  ink:Object.freeze({width:TOON_STYLE.outlineWidth,opacity:TOON_STYLE.outlineOpacity,shade:.26,saturation:.86,bias:.0001}),
  hair:Object.freeze({width:.85,opacity:.72,shade:.46,saturation:.88,bias:.000015}),
  face:Object.freeze({width:.75,opacity:.62,shade:.54,saturation:.90,bias:.000065})
});
export function surfaceKind(name) {
  return /hair/i.test(name) ? 'hair' : /face|eye|mouth/i.test(name) ? 'face' : 'ink';
}

export function applyCelShading(root) {
  const materials=new Set();
  root.traverse(mesh=>{
    for(const material of [mesh.material].flat().filter(Boolean)) {
      if(!material.isMeshToonMaterial || material.userData.paCel || /_alpha$/i.test(material.name)) continue;
      materials.add(material);
      material.userData.paCel=true;
      // The cel ramp is already bounded. Filmic highlight compression would turn
      // authored white hair grey again, so only this material bypasses it.
      material.toneMapped=false;
      const kind=surfaceKind(material.name);
      material.onBeforeCompile=shader=>{
        shader.uniforms.paBrightness={value:TOON_STYLE.brightness};
        shader.uniforms.paSurface={value:kind==='hair'?1:kind==='face'?2:0};
        shader.fragmentShader='uniform float paBrightness;\nuniform float paSurface;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          // Use the unquantized key-light normal, not already-lit brightness.
          // Otherwise summed fill lights flatten every pleat into the same band.
          float paLight=.75;
          #if NUM_DIR_LIGHTS > 0
            paLight=dot(normal,directionalLights[0].direction);
          #endif
          vec3 paShadow=vec3(.56,.54,.69);
          vec3 paMid=vec3(.74,.72,.86);
          if(paSurface>.5) { paShadow=vec3(.82,.80,.93); paMid=vec3(.96,.94,1.0); }
          if(paSurface>1.5) { paShadow=vec3(.94,.91,.97); paMid=vec3(1.0); }
          vec3 paShade=mix(paShadow,paMid,smoothstep(-.12,.06,paLight));
          float paHighlight=paSurface>.5?smoothstep(.46,.62,paLight):smoothstep(.72,.80,paLight);
          paShade=mix(paShade,vec3(1.0),paHighlight);
          outgoingLight=diffuseColor.rgb*paShade*paBrightness;
          // Lift only near-neutral bright texels, not purple cloth or eye colour.
          float paWhite=smoothstep(.55,.94,min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)));
          outgoingLight=mix(outgoingLight,vec3(1.0),paWhite*.08);
          outgoingLight=clamp(outgoingLight,0.0,1.0);
          #include <opaque_fragment>
        `);
      };
      material.customProgramCacheKey=()=> 'pa-cel-v2-'+kind;
      material.needsUpdate=true;
    }
  });
  return materials.size;
}

export function createToonRenderer(renderer,scene,camera,root) {
  applyCelShading(root);
  const resolution=new THREE.Vector2(1,1);
  const outlineMaterials=new Map();
  const outlineFor=(material,geometry)=>{
    const kind=surfaceKind(material.name);
    const channel=material.map?.channel ?? 0;
    const uv=['uv','uv1','uv2','uv3'][channel];
    const map=material.map && uv && geometry.hasAttribute(uv) ? material.map : null;
    // A shared surface profile is not a shared colour: each original material
    // retains its own atlas, tint, UV channel and texture transform.
    const key=material.uuid+':'+(map?uv:'untextured');
    if(outlineMaterials.has(key))return outlineMaterials.get(key);
    const profile=OUTLINE_PROFILES[kind];
    const outline=new THREE.ShaderMaterial({
    name:'PA_SoftOutline',side:THREE.BackSide,transparent:true,depthWrite:false,
    toneMapped:false,
    defines:map ? {USE_MAP:'',MAP_UV:uv,...(channel>0?{['USE_UV'+channel]:''}:{})} : {},
    uniforms:{
      paResolution:{value:resolution},paWidth:{value:profile.width},paDepthBias:{value:profile.bias},
      paBaseColor:{value:material.color || new THREE.Color(0xffffff)},paOpacity:{value:profile.opacity},
      paShade:{value:profile.shade},paSaturation:{value:profile.saturation},
      map:{value:map},mapTransform:{value:map?.matrix || new THREE.Matrix3()}
    },
    vertexShader:`
      #include <common>
      #include <uv_pars_vertex>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      uniform vec2 paResolution;
      uniform float paWidth;
      uniform float paDepthBias;
      void main() {
        #include <uv_vertex>
        #include <morphinstance_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        // Use the skinned normal before BackSide flips it. Width stays in CSS
        // pixels when the model is zoomed, resized or enters fullscreen.
        vec3 paNormal=normalize(normalMatrix*objectNormal);
        vec2 paDirection=(projectionMatrix*vec4(paNormal,0.0)).xy;
        paDirection/=max(length(paDirection),.0001);
        gl_Position.xy+=paDirection*(2.0*paWidth/paResolution)*gl_Position.w;
        // Bias the shell behind the original surface so polygon/UV seams do
        // not turn into a wireframe over otherwise continuous fabric.
        gl_Position.z+=paDepthBias*gl_Position.w;
      }
    `,
    fragmentShader:`
      #include <uv_pars_fragment>
      #include <map_pars_fragment>
      uniform vec3 paBaseColor;
      uniform float paOpacity;
      uniform float paShade;
      uniform float paSaturation;
      void main() {
        vec3 paBase=paBaseColor;
        #ifdef USE_MAP
          // Use the same UVs and sRGB texture as the surface. WebGL decodes the
          // sample to linear RGB; BA texture alpha is shader data, not coverage.
          paBase*=texture2D(map,vMapUv).rgb;
        #endif
        paBase=clamp(paBase,0.0,1.0);
        float paLuma=dot(paBase,vec3(.2126,.7152,.0722));
        // Hue-neutral darkening: gold stays warm, green stays green, neutral
        // hair stays grey. Different texels in one atlas keep their own colours.
        vec3 paInk=mix(vec3(paLuma),paBase,paSaturation)*paShade;
        gl_FragColor=vec4(paInk,paOpacity);
        #include <colorspace_fragment>
      }
    `
    });
    outline.userData.paSurface=kind;
    outline.userData.paSourceMaterial=material.uuid;
    outlineMaterials.set(key,outline);
    return outline;
  };
  const skip=new THREE.MeshBasicMaterial({visible:false});
  const meshes=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh) return;
    const useOutline=material=>!material.transparent && !/(?:eye|mouth|halo|_alpha)/i.test(material.name) ? outlineFor(material,mesh.geometry) : skip;
    const material=mesh.material;
    meshes.push({mesh,material,outline:Array.isArray(material)?material.map(useOutline):useOutline(material)});
  });
  let disposed=false;
  return {
    render() {
      if(disposed)return;
      for(const material of outlineMaterials.values()) {
        const map=material.uniforms.map.value;
        if(map?.matrixAutoUpdate)map.updateMatrix();
      }
      renderer.render(scene,camera);
      renderer.getSize(resolution);
      const autoClear=renderer.autoClear;
      try {
        renderer.autoClear=false;
        for(const entry of meshes)entry.mesh.material=entry.outline;
        renderer.render(scene,camera);
      } finally {
        for(const entry of meshes)entry.mesh.material=entry.material;
        renderer.autoClear=autoClear;
      }
    },
    dispose() { if(disposed)return;disposed=true;outlineMaterials.forEach(material=>material.dispose());outlineMaterials.clear();skip.dispose();meshes.length=0; }
  };
}
