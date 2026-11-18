import * as THREE from "three";
// All visible water uses a depth attribute sampled from the simulation. The
// fragment edge clips at zero depth instead of exposing whole grid triangles.
export function waterMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: "#7fbab4",
    roughness: 0.3,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float waterDepth;\nvarying float vWaterDepth;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWaterDepth = waterDepth;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vWaterDepth;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      if (vWaterDepth <= 0.005) discard;
      float depthMix = smoothstep(0.04, 0.65, vWaterDepth);
      diffuseColor.rgb *= mix(vec3(1.08, 1.04, 0.92), vec3(0.52, 0.77, 0.88), depthMix);
      diffuseColor.a *= smoothstep(0.005, 0.08, vWaterDepth) * mix(0.28, 0.92, depthMix);
    `,
      );
  };
  material.customProgramCacheKey = () => "depth-water-v1";
  return material;
}
