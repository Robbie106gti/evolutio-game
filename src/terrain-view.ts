import { waterMaterial } from "./water-view";
import * as THREE from "three";
import {
  WORLD_RADIUS,
  terrainHeight,
  landAt,
  regionWeights,
  changingWeights,
  waterDistance,
} from "./terrain";
import { type World } from "./sim.ts";
import { surfaceDepth, createWaterQuery } from "./ecology";
export function addBiomes(scene: THREE.Scene) {
  const vertices: number[] = [],
    colors: number[] = [];
  const color = new THREE.Color();
  const forest = new THREE.Color("#718751"),
    desert = new THREE.Color("#d1b27a"),
    plains = new THREE.Color("#a4ac70"),
    bank = new THREE.Color("#81955d");
  for (let x = -WORLD_RADIUS; x < WORLD_RADIUS; x += 1.5)
    for (let z = -WORLD_RADIUS; z < WORLD_RADIUS; z += 1.5) {
      if (Math.hypot(x, z) > WORLD_RADIUS - 1.8) continue;

      for (const [dx, dz] of [
        [0, 0],
        [0, 1.5],
        [1.5, 0],
        [1.5, 0],
        [0, 1.5],
        [1.5, 1.5],
      ]) {
        const px = x + dx,
          pz = z + dz,
          w = regionWeights(px, pz);
        color.setRGB(
          plains.r * w.plains + forest.r * w.forest + desert.r * w.desert,
          plains.g * w.plains + forest.g * w.forest + desert.g * w.desert,
          plains.b * w.plains + forest.b * w.forest + desert.b * w.desert,
        );
        color.lerp(
          bank,
          0.35 * Math.exp(-Math.max(0, waterDistance(px, pz)) / 3),
        );
        color.multiplyScalar(
          1 + 0.025 * Math.sin(px * 0.8) * Math.cos(pz * 0.7),
        );
        vertices.push(px, terrainHeight(px, pz), pz);
        colors.push(color.r, color.g, color.b);
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
  ground.userData.isTerrain = true;
  const runoffGeometry = geo.clone();
  const depths = new THREE.Float32BufferAttribute(
    new Float32Array(geo.getAttribute("position").count),
    1,
  );
  runoffGeometry.setAttribute("waterDepth", depths);
  const runoff = new THREE.Mesh(runoffGeometry, waterMaterial());
  runoff.renderOrder = 1;
  runoff.frustumCulled = false;
  scene.add(runoff);
  let last = -Infinity,
    previousWorld: World | undefined,
    elevationKey = "";
  return (world: World, force = false) => {
    if (!force && world === previousWorld && Math.abs(world.time - last) < 1)
      return;
    const key =
      world.weather.land?.map((c) => c.elevation ?? 0).join(",") ?? "";
    const reshape = key !== elevationKey || world !== previousWorld;
    previousWorld = world;
    elevationKey = key;
    last = world.time;
    const depthAt = createWaterQuery(world.ponds, world.weather.land);
    const samples = new Map<
      number,
      Map<number, { depth: number; surface: number }>
    >();
    const positions = geo.getAttribute("position"),
      colours = geo.getAttribute("color") as THREE.BufferAttribute;
    const waterPositions = runoffGeometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i),
        w = changingWeights(world.weather.land, x, z);
      color.setRGB(
        plains.r * w.plains + forest.r * w.forest + desert.r * w.desert,
        plains.g * w.plains + forest.g * w.forest + desert.g * w.desert,
        plains.b * w.plains + forest.b * w.forest + desert.b * w.desert,
      );
      if (reshape)
        (positions as THREE.BufferAttribute).setY(
          i,
          terrainHeight(x, z, world.weather.land),
        );
      let row = samples.get(x);
      if (!row) {
        row = new Map();
        samples.set(x, row);
      }
      let sample = row.get(z);
      if (!sample) {
        sample = {
          depth: depthAt(x, z),
          surface: surfaceDepth(world.weather.land, x, z),
        };
        row.set(z, sample);
      }
      const groundHeight = positions.getY(i);
      depths.setX(i, sample.depth);
      waterPositions.setY(
        i,
        sample.depth > 0.005
          ? Math.max(
              groundHeight + sample.surface + 0.012,
              groundHeight < 0.72 && sample.depth > sample.surface
                ? 0.69
                : groundHeight + 0.012,
            )
          : groundHeight - 0.025,
      );
      color.lerp(desert, (landAt(world.weather.land, x, z).sand ?? 0) * 0.8);
      color.multiplyScalar(1 + 0.025 * Math.sin(x * 0.8) * Math.cos(z * 0.7));
      colours.setXYZ(i, color.r, color.g, color.b);
    }
    colours.needsUpdate = true;
    waterPositions.needsUpdate = true;
    depths.needsUpdate = true;
    runoffGeometry.computeVertexNormals();
    if (reshape) {
      (positions as THREE.BufferAttribute).needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    }
  };
}
