import { aquaticModel, hasAquaticModel } from "./aquatic-models.ts";
import { mouseAppearance } from "./mouse-appearance.ts";
import type { Carcass } from "./decomposition.ts";
import { animalPose, plantLifeVisuals } from "./state-visuals.ts";
import { animalAppearance, plantAppearance, footPose } from "./appearance.ts";
import { careVisuals, babyOffset } from "./care-visuals.ts";
import { treeRestSite } from "./resting.ts";
import * as THREE from "three";
import {
  rockAt,
  landAt,
  PLANT_INSTANCE_CAPACITY,
  terrainHeight,
  type LandCell,
} from "./terrain.ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  type Animal,
  type Plant,
  type PlantKind,
  type PlantRemains,
} from "./model.ts";
import { PLANTS, SPECIES } from "./species.ts";
import { growthScale, lifeStage } from "./biology.ts";

// Shared geometry batches all animal parts into three instanced draw calls.
function shape(
  parts: {
    geo: THREE.BufferGeometry;
    pos: number[];
    scale?: number[];
    rot?: number[];
  }[],
) {
  const geometries = parts.map(
    ({ geo, pos, scale = [1, 1, 1], rot = [0, 0, 0] }) => {
      geo.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(...pos),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
          new THREE.Vector3(...scale),
        ),
      );
      return geo.index ? geo.toNonIndexed() : geo;
    },
  );
  return mergeGeometries(geometries)!;
}
const ball = () => new THREE.IcosahedronGeometry(1, 1);
const cone = () => new THREE.ConeGeometry(1, 1, 5);
const box = () => new THREE.BoxGeometry(1, 1, 1);
function fernGeometry() {
  const parts: Parameters<typeof shape>[0] = [];
  for (let frond = 0; frond < 7; frond++) {
    const angle = frond * 2.4;
    const reach = 0.62 + (frond % 3) * 0.1;
    const point = (t: number) => new THREE.Vector3(
      Math.cos(angle) * reach * t,
      0.06 + Math.sin(t * 2.15) * (0.55 + (frond % 2) * 0.15),
      Math.sin(angle) * reach * t,
    );
    for (let row = 1; row <= 6; row++) {
      const start = point((row - 1) / 6), end = point(row / 6);
      const direction = end.clone().sub(start);
      const rotation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), direction.clone().normalize(),
      );
      const euler = new THREE.Euler().setFromQuaternion(rotation);
      parts.push({
        geo: new THREE.CylinderGeometry(0.012, 0.019, direction.length(), 3),
        pos: start.lerp(end, 0.5).toArray(), rot: [euler.x, euler.y, euler.z],
      });
      const length = 0.09 + 0.14 * Math.sin(Math.PI * row / 6);
      for (const side of [-1, 1]) {
        const yaw = angle + side * 0.95;
        parts.push({
          geo: new THREE.OctahedronGeometry(),
          pos: [end.x + length * Math.cos(yaw), end.y, end.z + length * Math.sin(yaw)],
          rot: [0, -yaw, 0], scale: [length, 0.018, length * 0.3],
        });
      }
    }
  }
  return shape(parts);
}
function plantGeometry(kind: PlantKind, variety = 0) {
  if (variety === 1 && kind === "tree")
    return shape(
      [-2, -1, 0, 1, 2].map((i) => ({
        geo: ball(),
        pos: [
          Math.sin(i * 2.4) * 0.75,
          1.85 + (!i ? 0.55 : Math.abs(i) * 0.08),
          Math.cos(i * 2.4) * 0.5,
        ],
        scale: [0.85, 0.8, 0.8],
      })),
    );
  if (variety === 2 && kind === "tree")
    return shape(
      [-1, 0, 1].map((i) => ({
        geo: ball(),
        pos: [i * 0.75, 2 + (i === 0 ? 0.15 : 0), i * 0.2],
        scale: [0.9, 0.35, 1],
      })),
    );
  if (variety === 1 && kind === "grass")
    return fernGeometry();
  if (variety === 2 && kind === "grass")
    return shape([
      { geo: new THREE.CylinderGeometry(0.025, 0.04, 0.65, 5), pos: [0, 0.325, 0] },
      ...[-1, 1].map(side => ({
        geo: new THREE.OctahedronGeometry(),
        pos: [side * 0.12, 0.23, 0], scale: [0.08, 0.21, 0.075],
        rot: [0, 0, -side * 0.72],
      })),
    ]);
  if (variety === 2 && kind === "bush")
    return shape([{ geo: new THREE.CapsuleGeometry(0.23, 1.18, 3, 10), pos: [0, 0.82, 0] }]);

  if (kind === "grass")
    return shape(
      [-1, 0, 1].map((i) => ({
        geo: cone(),
        pos: [i * 0.2, 0.28, 0],
        scale: [0.14, 0.65 + Math.abs(i) * 0.18, 0.17],
        rot: [0, 0, -i * 0.25],
      })),
    );
  if (kind === "bush")
    return shape(
      [-1, 0, 1].map((i) => ({
        geo: ball(),
        pos: [i * 0.3, 0.42 + (!i ? 0.2 : 0), 0],
        scale: [0.48, 0.5, 0.48],
      })),
    );
  return shape([
    { geo: cone(), pos: [0, 1.2, 0], scale: [0.95, 1.2, 0.85] },
    { geo: cone(), pos: [0.06, 1.85, 0], scale: [0.72, 1.35, 0.7] },
    { geo: cone(), pos: [0, 2.48, 0.04], scale: [0.43, 1.1, 0.45] },
  ]);
}
export class OrganismMeshes {
  private shootColor = new THREE.Color("#a9eb50");
  private windTime = { value: 0 };
  animal: Record<string, THREE.InstancedMesh>;
  plant: Record<PlantKind, THREE.InstancedMesh>;
  plantVariants: Record<PlantKind, THREE.InstancedMesh[]>;
  private readonly bloomColor = new THREE.Color("#ffe3bd");
  private cactusArms: THREE.InstancedMesh;
  private cactusFlower: THREE.InstancedMesh;
  private weatheredCactus = new THREE.Color("#887e73");
  petals: THREE.InstancedMesh;
  accents: THREE.InstancedMesh;
  private previousLand: LandCell[] | undefined;
  trunks: THREE.InstancedMesh;
  deadWood: THREE.InstancedMesh;
  leafLitter: THREE.InstancedMesh;
  woodMushrooms: THREE.InstancedMesh;
  carcassMesh: THREE.InstancedMesh;
  eyes: THREE.InstancedMesh;
  nests: THREE.InstancedMesh;
  perches: THREE.InstancedMesh;
  pickables: THREE.InstancedMesh[];
  ids = new Map<THREE.Object3D, number[]>();
  dummy = new THREE.Object3D();
  base = new THREE.Object3D();
  dryPlantColor = new THREE.Color("#a38b54");
  color = new THREE.Color();
  constructor(scene: THREE.Scene) {
    const mesh = (geo: THREE.BufferGeometry, color: string, max: number) => {
      const m = new THREE.InstancedMesh(
        geo,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          flatShading: true,
        }),
        max,
      );
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.animal = {
      round: mesh(ball(), "#ffffff", 14000),
      angular: mesh(cone(), "#ffffff", 4000),
      limb: mesh(box(), "#ffffff", 10000),
    };
    this.plant = {
      grass: mesh(plantGeometry("grass"), "#ffffff", PLANT_INSTANCE_CAPACITY),
      bush: mesh(plantGeometry("bush"), "#ffffff", PLANT_INSTANCE_CAPACITY),
      tree: mesh(plantGeometry("tree"), "#ffffff", PLANT_INSTANCE_CAPACITY),
    };
    this.plantVariants = Object.fromEntries(
      (Object.keys(this.plant) as PlantKind[]).map((kind) => [
        kind,
        [
          this.plant[kind],
          mesh(plantGeometry(kind, 1), "#ffffff", PLANT_INSTANCE_CAPACITY),
          mesh(plantGeometry(kind, 2), "#ffffff", PLANT_INSTANCE_CAPACITY),
        ],
      ]),
    ) as Record<PlantKind, THREE.InstancedMesh[]>;
    for (const canopy of Object.values(this.plantVariants).flat()) {
      const material = canopy.material as THREE.MeshStandardMaterial;
      const herb = this.plantVariants.grass.includes(canopy);
      if (herb)
        canopy.geometry.setAttribute(
          "wilt",
          new THREE.InstancedBufferAttribute(
            new Float32Array(canopy.instanceMatrix.count),
            1,
          ),
        );
      material.onBeforeCompile = (shader) => {
        shader.uniforms.vegetationTime = this.windTime;
        shader.vertexShader =
          (herb ? "attribute float wilt;\n" : "") +
          "uniform float vegetationTime;\n" +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `
          #include <begin_vertex>
          #ifdef USE_INSTANCING
          float seed = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
          ${
            herb
              ? `float tip = max(0.0, position.y);
          float arch = wilt * tip * tip;
          transformed.x += arch * (0.64 + position.x * 1.3);
          transformed.z += arch * (0.22 + position.z * 1.4);
          transformed.y -= arch * (0.9 + position.x * 0.22);`
              : ""
          }
          float bend = max(0.0, position.y - 0.65);
          transformed.x += sin(vegetationTime * 1.4 + seed) * bend * 0.018;
          transformed.z += cos(vegetationTime * 1.1 + seed) * bend * 0.012;
          #endif
        `,
        );
      };
      material.customProgramCacheKey = () =>
        herb ? "herb-wilt" : "vegetation-sway-v1";
    }
    const elbow = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.22, 0.015, 0),
      new THREE.Vector3(0.35, 0.14, 0), new THREE.Vector3(0.36, 0.52, 0),
    ]);
    this.cactusArms = mesh(shape([
      { geo: new THREE.TubeGeometry(elbow, 7, 0.115, 7, false), pos: [0, 0, 0] },
      { geo: ball(), pos: [0.36, 0.52, 0], scale: [0.115, 0.115, 0.115] },
    ]), "#ffffff", PLANT_INSTANCE_CAPACITY);
    this.cactusFlower = mesh(shape(Array.from({ length: 7 }, (_, i) => {
      const angle = i * Math.PI * 2 / 7;
      return { geo: ball(), pos: [0.095 * Math.sin(angle), 0, 0.095 * Math.cos(angle)],
        rot: [-0.4, angle, 0], scale: [0.07, 0.065, 0.135] };
    })), "#f2739b", PLANT_INSTANCE_CAPACITY);
    this.petals = mesh(new THREE.IcosahedronGeometry(1, 0), "#ffffff", PLANT_INSTANCE_CAPACITY);
    this.accents = mesh(
      shape(
        [-1, 0, 1].map((i) => ({
          geo: ball(),
          pos: [i * 0.25, 0, i * 0.15],
          scale: [0.13, 0.12, 0.13],
        })),
      ),
      "#ffffff",
      PLANT_INSTANCE_CAPACITY,
    );
    this.trunks = mesh(
      shape([
        { geo: new THREE.CylinderGeometry(0.11, 0.23, 1.8, 6), pos: [0, 0, 0] },
        ...[-1, 1].map((side) => ({
          geo: new THREE.CylinderGeometry(0.045, 0.1, 0.9, 5),
          pos: [side * 0.23, 0.45, side * 0.1],
          rot: [0, 0, -side * 0.65],
        })),
      ]),
      "#756047",
      PLANT_INSTANCE_CAPACITY,
    );
    this.deadWood = mesh(
      shape([
        { geo: box(), pos: [0, 1.2, 0], scale: [0.2, 2.4, 0.2] },
        {
          geo: box(),
          pos: [0.35, 1.65, 0],
          scale: [0.12, 1.3, 0.12],
          rot: [0, 0, -0.7],
        },
        {
          geo: box(),
          pos: [-0.35, 1.3, 0],
          scale: [0.12, 1.2, 0.12],
          rot: [0, 0, 0.8],
        },
        {
          geo: box(),
          pos: [0, 1.9, 0.3],
          scale: [0.1, 0.9, 0.1],
          rot: [0.7, 0, 0],
        },
      ]),
      "#86745d",
      PLANT_INSTANCE_CAPACITY,
    );
    this.leafLitter = mesh(ball(), "#977444", PLANT_INSTANCE_CAPACITY);
    this.woodMushrooms = mesh(
      shape([
        {
          geo: new THREE.CylinderGeometry(0.045, 0.065, 0.3, 5),
          pos: [0, 0.15, 0],
        },
        {
          geo: new THREE.SphereGeometry(
            0.22,
            8,
            4,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2,
          ),
          pos: [0, 0.3, 0],
          scale: [1, 0.6, 1],
        },
      ]),
      "#ddbc89",
      PLANT_INSTANCE_CAPACITY,
    );
    this.carcassMesh = mesh(ball(), "#856b57", 560);
    this.eyes = mesh(ball(), "#273a32", 1120);
    this.nests = mesh(
      new THREE.TorusGeometry(0.38, 0.1, 5, 12),
      "#8a6544",
      560,
    );
    this.perches = mesh(box(), "#756047", 560);
    this.pickables = [
      ...Object.values(this.animal),
      ...Object.values(this.plantVariants).flat(),
      this.accents,
      this.petals,
      this.cactusArms,
      this.cactusFlower,
      this.trunks,
      this.nests,
      this.perches,
      this.deadWood,
      this.leafLitter,
      this.woodMushrooms,
      this.carcassMesh,
    ];
  }
  private plantTime = -Infinity;
  private previousPlants: Plant[] = [];
  update(
    animals: Animal[],
    plants: Plant[],
    now?: number,
    selected = 0,
    land?: LandCell[],
    remains: PlantRemains[] = [],
    embryos: Animal[] = [],
    carcasses: Carcass[] = [],
    depthAt?: (x: number, z: number) => number,
  ) {
    this.windTime.value = now ?? 0;
    const refreshPlants =
      land !== this.previousLand ||
      now === undefined ||
      now - this.plantTime >= 0.5 ||
      now < this.plantTime ||
      plants.length !== this.previousPlants.length ||
      plants.some((p, i) => p !== this.previousPlants[i]) ||
      plants.some((p) => p.id === selected);
    const updatedMeshes = [
      ...Object.values(this.animal),
      this.eyes,
      this.nests,
      this.perches,
      ...(refreshPlants
        ? [
            ...Object.values(this.plantVariants).flat(),
            this.accents,
            this.petals,
            this.cactusArms,
            this.cactusFlower,
            this.trunks,
            this.deadWood,
            this.leafLitter,
            this.woodMushrooms,
            this.carcassMesh,
          ]
        : []),
    ];
    if (refreshPlants) {
      this.previousLand = land;
      this.plantTime = now ?? -Infinity;
      this.previousPlants = plants.slice();
    }
    for (const mesh of updatedMeshes) {
      mesh.count = 0;
      this.ids.set(mesh, []);
    }
    const ensureCapacity = (mesh: THREE.InstancedMesh) => {
      if (mesh.count >= mesh.instanceMatrix.count) {
        const capacity = mesh.instanceMatrix.count * 2;
        const wilt = mesh.geometry.getAttribute("wilt");
        if (wilt) {
          const values = new Float32Array(capacity);
          values.set(wilt.array);
          mesh.geometry.setAttribute(
            "wilt",
            new THREE.InstancedBufferAttribute(values, 1),
          );
        }
        const matrix = new Float32Array(capacity * 16);
        matrix.set(mesh.instanceMatrix.array);
        const color = mesh.instanceColor
          ? new Float32Array(capacity * 3)
          : null;
        if (color) color.set(mesh.instanceColor!.array);
        mesh.dispose(); // Release renderer buffers before growing the allocation.
        mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrix, 16);
        if (color)
          mesh.instanceColor = new THREE.InstancedBufferAttribute(color, 3);
      }
    };
    const put = (mesh: THREE.InstancedMesh, id: number) => {
      ensureCapacity(mesh);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(mesh.count, this.dummy.matrix);
      this.ids.get(mesh)!.push(id);
      mesh.count++;
    };
    const treesById = new Map(
      plants.filter((p) => p.kind === "tree").map((p) => [p.id, p]),
    );
    const drawnNests = new Set<number>();
    for (const a of [
      ...embryos,
      ...animals.filter((a) => a.nursery),
      ...animals.filter((a) => !a.nursery),
    ]) {
      const g = a.genes,
        profile = SPECIES[a.species];

      const size = g.size * growthScale(a) * profile.size * 0.85;
      const owner = a.nursery?.kind === "nest" ? a.nursery.owner : a.id;
      if (drawnNests.has(owner)) continue;
      const roost = treesById.get(
        a.nursery?.kind === "nest" ? a.nursery.site : a.roost,
      );
      if (a.species === "bird" && roost && roost.health > 0) {
        const site = treeRestSite(roost, owner, land);
        const y = terrainHeight(site.x, site.z, land) + site.altitude;
        this.dummy.position.set(site.x, y - 0.04, site.z);
        this.dummy.rotation.set(Math.PI / 2, 0, a.id);
        this.dummy.scale.setScalar(Math.max(0.6, size * 1.1));
        put(this.nests, owner);
        drawnNests.add(owner);
        this.dummy.position.set(
          (site.x + roost.x) / 2,
          y - 0.13,
          (site.z + roost.z) / 2,
        );
        this.dummy.rotation.set(
          0,
          -Math.atan2(site.z - roost.z, site.x - roost.x),
          0,
        );
        this.dummy.scale.set(
          Math.hypot(site.x - roost.x, site.z - roost.z),
          0.12,
          0.12,
        );
        put(this.perches, owner);
      }
      if (
        a.species === "bird" &&
        !roost &&
        (a.state === "Sleeping" || a.nursery?.kind === "nest")
      ) {
        this.dummy.position.set(a.x, terrainHeight(a.x, a.z, land) + 0.04, a.z);
        this.dummy.rotation.set(Math.PI / 2, 0, a.id);
        this.dummy.scale.setScalar(Math.max(0.6, size * 1.1));
        put(this.nests, owner);
        drawnNests.add(owner);
      }
    }
    const careStates = careVisuals(animals);
    for (const a of animals) {
      const care = careStates.get(a.id)!;
      const pulse = (1 + Math.sin(a.age * 9 + a.id)) / 2;
      const offset = babyOffset(a);
      const feedingAngle = care.recipient
        ? Math.atan2(babyOffset(care.recipient).z, babyOffset(care.recipient).x)
        : a.angle;
      const feedingOffset = care.feeding ? 0.42 : 0;
      const g = a.genes,
        profile = SPECIES[a.species];
      const look = animalAppearance(a);
      const mouseLook = a.species === "mouse" ? mouseAppearance(g) : null;
      const size = g.size * growthScale(a) * profile.size * 0.85;
      const phase =
        (a.distance * 7 * g.cadence) / Math.max(0.6, g.stride) + a.id;
      const pose = animalPose(a);
      const moving = pose.moving;
      const swing = moving ? Math.sin(phase) * 0.45 * g.stride * pose.reach : 0;
      const hop =
        pose.hop +
        (a.species === "bird" && moving && a.altitude < 0.6
          ? Math.abs(Math.sin(phase)) * 0.16 * g.stride
          : 0);
      const base = this.base;
      base.position.set(
        a.x + offset.x - Math.cos(feedingAngle) * feedingOffset,
        terrainHeight(a.x, a.z, land) +
          hop +
          (care.begging ? pulse * 0.09 : care.chewing ? pulse * 0.025 : 0) +
          a.altitude +
          (a.species === "snake" && a.state === "Basking"
            ? (rockAt(a.x, a.z)?.height ?? 0) * 1.2
            : 0),
        a.z + offset.z - Math.sin(feedingAngle) * feedingOffset,
      );
      base.rotation.set(
        a.state === "Drying on sunny rock" || a.state === "Drying in shelter"
          ? Math.sin(a.age * 18) * 0.045 * a.wetness
          : 0,
        -feedingAngle,
        care.feeding
          ? -0.12 - pulse * 0.18
          : care.begging
            ? 0.12 + pulse * 0.12
            : pose.pitch,
      );
      base.scale.set(size, size * pose.crouch, size);
      base.updateMatrix();
      const coat = mouseLook
        ? mouseLook.coat.clone().multiplyScalar(1 - a.wetness * 0.15)
        : new THREE.Color().setHSL(
            ((a.species === "bird" && a.birdDiet === "raptor"
              ? 0.08
              : profile.hue) +
              g.hue +
              1) %
              1,
            a.species === "wolf" ? 0.08 : a.species === "mouse" ? 0.23 : 0.48,
            0.48 - a.wetness * 0.08,
          );
      if (a.infection > 0.2)
        coat.lerp(new THREE.Color("#8c9480"), a.infection * 0.35);
      if (lifeStage(a) === "Elder")
        coat.lerp(new THREE.Color("#bec1b7"), mouseLook ? 0.18 : 0.6);
      if (lifeStage(a) === "Baby")
        coat.lerp(new THREE.Color("#fff4dc"), mouseLook ? 0.12 : 0.25);
      const dark = coat.clone().multiplyScalar(mouseLook ? 0.28 : 0.55),
        light = coat.clone().lerp(new THREE.Color("#fff4dc"), 0.45);
      const part = (
        mesh: THREE.InstancedMesh,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        tint: THREE.Color,
        rx = 0,
        ry = 0,
        rz = 0,
      ) => {
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(rx, ry, rz);
        this.dummy.scale.set(sx, sy, sz);
        this.dummy.updateMatrix();
        this.dummy.matrix.premultiply(base.matrix);
        ensureCapacity(mesh);
        mesh.setMatrixAt(mesh.count, this.dummy.matrix);
        this.ids.get(mesh)!.push(a.id);
        mesh.setColorAt(mesh.count, tint);
        mesh.count++;
      };
      const round = this.animal.round,
        limb = this.animal.limb,
        angular = this.animal.angular;
      if (a.species === "spider" || a.species === "scorpion" || a.species === "crab") {
        const crab = a.species === "crab", scorpion = a.species === "scorpion";
        const tucked = a.state === "Sleeping" ? 0.68 : 1;
        part(round, -0.13, 0.27 * tucked, 0, crab ? 0.43 : 0.49, 0.23, crab ? 0.58 : 0.31, coat);
        part(round, 0.32 * tucked, 0.27 * tucked, 0, 0.25, 0.19, 0.25, dark);
        for (const side of [-1, 1]) {
          for (let leg = 0; leg < 4; leg++) {
            const stride = pose.moving ? Math.sin(phase + leg * 2 + side) * 0.14 : 0;
            part(limb, leg * 0.18 - 0.34 + stride, 0.18, side * 0.42 * tucked,
              0.06, 0.06, 0.38 * tucked, dark, side * 0.34, side * (leg - 1.5) * 0.24);
          }
          if (crab || scorpion) part(round, 0.53, 0.3, side * 0.39, 0.26, 0.14, 0.14, light);
          part(this.eyes, 0.32 * tucked + 0.17, 0.27 * tucked + 0.11, side * 0.13, 0.05, 0.05, 0.05, dark);
        }
        if (scorpion) for (let j = 0; j < 5; j++)
          part(round, -0.48 - 0.25 * Math.sin(j * 0.7), 0.32 + j * 0.13, 0,
            0.15, 0.13, 0.11, j === 4 ? dark : coat);
        continue;
      }
      if (a.state === "Sleeping" && hasAquaticModel(a)) {
        aquaticModel(a, part, this.animal, this.eyes, coat, light, dark);
        continue;
      }
      if (a.state === "Sleeping") {
        const breath = 1 + Math.sin(a.age * 1.8) * 0.025;
        const eye = (x: number, y: number, z: number) =>
          part(this.eyes, x, y, z, 0.075, 0.012, 0.025, dark);
        if (a.species === "snake") {
          for (let j = 0; j < 14; j++) {
            const angle = (j / 13) * Math.PI * 3,
              radius = 0.43 - j * 0.012;
            part(
              round,
              Math.cos(angle) * radius,
              0.17 + (j > 8 ? 0.08 : 0),
              Math.sin(angle) * radius,
              0.22 * (1 - j * 0.025),
              0.17 * breath,
              0.21 * (1 - j * 0.025),
              j % 3 === 1 && g.markings > 0.35 ? dark : coat,
            );
          }
          part(round, 0.13, 0.35, 0.12, 0.25, 0.15, 0.22, coat);
          part(round, 0.29, 0.32, 0.12, 0.13, 0.075, 0.13, light);
          eye(0.24, 0.42, 0.27);
        } else if (a.species === "bird") {
          part(round, 0, 0.3, 0, 0.45 * g.length, 0.33 * breath, 0.36, coat);
          for (const side of [-1, 1])
            part(round, -0.07, 0.31, side * 0.25, 0.34, 0.23, 0.1, dark);
          part(round, -0.2, 0.39, 0.13, 0.23, 0.21, 0.22, light);
          part(
            angular,
            -0.26,
            0.32,
            0.24,
            0.08,
            0.2,
            0.08,
            dark,
            0,
            0,
            Math.PI / 2,
          );
          part(
            angular,
            -0.52,
            0.23,
            0,
            0.2,
            0.35,
            0.18,
            dark,
            0,
            0,
            Math.PI / 2,
          );
          eye(-0.23, 0.45, 0.31);
        } else if (a.species === "bug") {
          part(round, 0, 0.18, 0, 0.48 * g.length, 0.2 * breath, 0.3, coat);
          part(round, 0.35, 0.14, 0, 0.2, 0.15, 0.2, light);
          for (let j = 0; j < 3; j++)
            for (const side of [-1, 1])
              part(
                limb,
                -0.25 + j * 0.22,
                0.07,
                side * 0.2,
                0.15,
                0.06,
                0.18,
                dark,
              );
          eye(0.42, 0.2, 0.15);
        } else {
          // Curled mammals: tucked paws and muzzle, tail wrapped around the body.
          part(round, 0, 0.25, 0, 0.47 * g.length, 0.29 * breath, 0.46, coat);
          part(round, 0.24, 0.22, 0.24, 0.28, 0.22, 0.26, light);
          for (const side of [-1, 1])
            part(round, 0.07, 0.07, side * 0.19, 0.2, 0.09, 0.12, light);
          for (let j = 0; j < 7; j++) {
            const angle = 1.6 + j * 0.43 * (mouseLook?.tail ?? 1);
            part(
              round,
              Math.cos(angle) * 0.48,
              0.14,
              Math.sin(angle) * 0.48,
              0.16,
              0.1,
              0.13,
              a.species === "fox" && j === 6 ? light : coat,
            );
          }
          for (const side of [-1, 1])
            part(
              a.species === "mouse" ? round : angular,
              0.15,
              0.43,
              0.24 + side * 0.13,
              0.1 * (mouseLook?.ear ?? 1),
              0.14 * (mouseLook?.ear ?? 1),
              0.09,
              light,
            );
          if (mouseLook)
            for (let j = 0; j < mouseLook.patches; j++)
              part(
                round,
                (j - 2) * 0.14 * g.length,
                0.51,
                0,
                0.12 * mouseLook.patch,
                0.07,
                0.25,
                dark,
              );
          eye(0.36, 0.29, 0.38);
        }
        continue;
      }
      let headX = 0.55 * g.length,
        headY = 0.65;
      if (hasAquaticModel(a)) {
        ({ headX, headY } = aquaticModel(
          a,
          part,
          this.animal,
          this.eyes,
          coat,
          light,
          dark,
          (a.species === "turtle" || a.species === "crocodile") &&
            (depthAt?.(a.x, a.z) ?? 0) > 0.2,
        ));
      } else if (a.species === "snake") {
        headX = 0.8 * g.length;
        // A snake draws prey in, then swallows in a wave along its neck.
        const swallow = (a.age * 0.38 * g.cadence + a.id) % 1;
        const gape =
          pose.eating && swallow < 0.45
            ? Math.sin((Math.PI * swallow) / 0.45)
            : 0;
        headY = pose.eating ? 0.23 + gape * 0.025 : 0.24 - pose.headDip * 0.5;
        const amplitude = 0.22 * g.stride;
        const headZ = Math.sin(phase) * amplitude;
        part(round, headX, headY, headZ, 0.23, 0.115, 0.16, coat);
        part(
          round,
          headX + 0.15,
          headY - 0.035 - gape * 0.045,
          headZ,
          0.15,
          0.075,
          0.115,
          light,
          0,
          0,
          -gape * 0.24,
        );
        if (moving && Math.sin(a.age * 5 + a.id) > 0.58) {
          part(
            limb,
            headX + 0.34,
            headY - 0.04,
            headZ,
            0.16,
            0.014,
            0.016,
            dark,
          );
          for (const side of [-1, 1])
            part(
              limb,
              headX + 0.44,
              headY - 0.04,
              headZ + side * 0.025,
              0.085,
              0.012,
              0.012,
              dark,
              0,
              -side * 0.45,
            );
        }
        // Span adjacent wave points so the tapered tail stays connected as it bends.
        for (let j = 0; j < 14; j++) {
          const t = j / 13,
            dx = 0.16 * g.length;
          const z0 = Math.sin(phase - j * 0.43) * amplitude;
          const z1 = Math.sin(phase - (j + 1) * 0.43) * amplitude;
          const swelling =
            pose.eating && swallow > 0.25
              ? 0.075 *
                Math.max(0, 1 - Math.abs(j - (swallow - 0.25) * 10) / 1.7) *
                Math.sin((Math.PI * (swallow - 0.25)) / 0.75)
              : 0;
          const radius =
            0.045 + 0.13 * Math.sin(Math.PI * (0.13 + 0.87 * t)) + swelling;
          const x = headX - (j + 0.5) * dx,
            z = (z0 + z1) / 2;
          const y =
            0.055 + radius * 0.56 + (headY - 0.18) * Math.max(0, 1 - j / 3);
          part(
            round,
            x,
            y,
            z,
            Math.hypot(dx, z1 - z0) * 0.83,
            radius * 0.78,
            radius,
            coat,
            0,
            Math.atan2(z1 - z0, dx),
          );
          if (j % 3 === 1 && g.markings > 0.12)
            part(
              round,
              x,
              y + radius * 0.61,
              z,
              0.055 * g.length,
              0.035,
              radius * (0.45 + 0.45 * g.markings),
              dark,
            );
        }
      } else {
        const bug = a.species === "bug",
          bird = a.species === "bird";
        const height = bug ? 0.3 : 0.3 + 0.22 * g.limbs;
        headY = height + 0.19 - pose.headDip;
        part(
          round,
          0,
          height,
          0,
          0.57 * g.length,
          (bug ? 0.32 : 0.34) * look.coat,
          0.33 * look.coat,
          coat,
        );
        part(
          round,
          headX,
          headY,
          0,
          (bug ? 0.24 : 0.28) * look.head,
          0.25 * look.head,
          0.25 * look.head,
          light,
        );
        if (bug) {
          for (const side of [-1, 1])
            part(
              limb,
              headX + 0.22,
              headY + 0.23,
              side * 0.17,
              0.24,
              0.027,
              0.027,
              dark,
              0,
              -side * 0.45,
              0.55,
            );
        }
        if (!bug && !bird) {
          // Paired cheeks and a dark nose make small silhouettes readable.
          for (const side of [-1, 1])
            part(
              round,
              headX + 0.19,
              headY - 0.08,
              side * 0.09,
              0.16,
              0.1,
              0.11,
              light,
            );
          part(
            round,
            headX + (a.species === "fox" || a.species === "wolf" ? 0.51 : 0.33),
            headY - 0.04,
            0,
            0.07,
            0.055,
            0.065,
            dark,
          );
        }
        if (a.species === "fox" || a.species === "wolf") {
          part(round, headX + 0.23, headY - 0.05, 0, 0.32, 0.13, 0.15, light);
          part(
            round,
            -0.8 * g.length,
            height * 0.8,
            Math.sin(phase * 0.5) * 0.12,
            0.55,
            a.species === "fox" ? 0.2 : 0.14,
            0.18,
            coat,
            0,
            0,
            0.3,
          );
          if (a.species === "fox")
            part(
              round,
              -1.15 * g.length,
              height,
              0,
              0.18,
              0.16,
              0.16,
              new THREE.Color("#f1ead8"),
            );
        }
        if (bird) {
          part(
            angular,
            headX + 0.32,
            headY,
            0,
            0.13,
            0.4,
            0.13,
            new THREE.Color("#d4a44e"),
            0,
            0,
            -Math.PI / 2,
          );
          for (const side of [-1, 1]) {
            const flying = a.altitude > 0.6;
            const beat = a.age * 9 * g.cadence + a.id;
            const span = g.limbs * (a.birdDiet === "raptor" ? 1.25 : 1);
            // Shoulder and wrist have different phases: the tip trails the
            // downstroke and folds slightly on recovery instead of a rigid flap.
            const shoulder = flying ? Math.sin(beat) * 0.75 : -0.95;
            const wrist = flying
              ? shoulder + Math.sin(beat - 0.65) * 0.3
              : -0.55;
            const rootZ = side * 0.21;
            const rootY = height + 0.12;
            const elbowZ = rootZ + side * Math.cos(shoulder) * 0.48 * span;
            const elbowY = rootY + Math.sin(shoulder) * 0.48 * span;
            const tipZ = elbowZ + side * Math.cos(wrist) * 0.45 * span;
            const tipY = elbowY + Math.sin(wrist) * 0.45 * span;
            if (flying) {
              part(
                round,
                -0.08,
                (rootY + elbowY) / 2,
                (rootZ + elbowZ) / 2,
                0.38,
                0.065,
                0.31 * span,
                coat,
                -side * shoulder,
              );
              part(
                round,
                -0.22,
                (elbowY + tipY) / 2,
                (elbowZ + tipZ) / 2,
                0.29,
                0.045,
                0.3 * span,
                dark,
                -side * wrist,
              );
              for (let feather = 0; feather < 4; feather++) {
                const spread = feather / 3;
                // Reverse the fan: narrow attachment at the wrist, splayed
                // outer tips. Rotating symmetric ellipsoids alone has no effect.
                const fan = (spread - 0.5) * 1.25;
                const featherLength =
                  (0.32 - Math.abs(spread - 0.5) * 0.08) * span;
                const outward = Math.cos(fan) * featherLength * 0.8;
                part(
                  round,
                  -0.22 +
                    (spread - 0.5) * 0.09 +
                    Math.sin(fan) * featherLength * 0.8,
                  tipY + Math.sin(wrist) * outward,
                  tipZ + side * Math.cos(wrist) * outward,
                  0.065,
                  0.025,
                  featherLength,
                  feather % 2 ? dark : coat,
                  -side * wrist,
                  side * fan,
                );
              }
            } else {
              // Resting flight feathers overlap backwards against the body.
              part(
                round,
                -0.15,
                height + 0.05,
                side * 0.3,
                0.42,
                0.2,
                0.085,
                coat,
                0,
                side * 0.12,
                -0.12,
              );
              for (let feather = 0; feather < 3; feather++)
                part(
                  round,
                  -0.36 - feather * 0.045,
                  height - feather * 0.045,
                  side * (0.32 + feather * 0.012),
                  0.24,
                  0.055,
                  0.04,
                  feather % 2 ? dark : coat,
                  0,
                  side * 0.1,
                  -0.12,
                );
            }
          }
          part(
            angular,
            -0.65 * g.length,
            height,
            0,
            0.25,
            0.6,
            0.22,
            dark,
            0,
            0,
            Math.PI / 2,
          );
        } else if (!bug) {
          for (const side of [-1, 1])
            part(
              a.species === "mouse" ? round : angular,
              headX - 0.08,
              headY + 0.3,
              side * 0.19,
              mouseLook ? 0.19 * mouseLook.ear : 0.15,
              mouseLook ? 0.28 * mouseLook.ear : 0.32 * look.ear,
              0.12,
              light,
            );
          if (a.species !== "fox" && a.species !== "wolf")
            for (let j = 0; j < 5; j++)
              part(
                round,
                -0.55 * g.length - j * 0.19 * (mouseLook?.tail ?? 1),
                height + j * 0.045,
                Math.sin(phase * 0.6 - j * 0.4) * 0.08,
                (0.19 - j * 0.018) * (mouseLook?.tail ?? 1),
                mouseLook ? 0.055 - j * 0.006 : 0.1 - j * 0.01,
                mouseLook ? 0.055 - j * 0.006 : 0.1 - j * 0.01,
                a.species === "mouse" ? light : coat,
              );
        } else {
          for (const side of [-1, 1])
            part(
              limb,
              headX + 0.16,
              headY + 0.19,
              side * 0.19,
              0.04,
              0.4,
              0.04,
              dark,
              side * 0.4,
              0,
              -0.5,
            );
        }
        const pairs = bug ? 3 : bird ? 1 : 2;
        for (let j = 0; j < pairs; j++)
          for (const side of [-1, 1]) {
            const x =
              pairs === 1 ? 0 : (j / (pairs - 1) - 0.5) * 0.7 * g.length;
            if (!bug && !bird) {
              const stridePhase = phase + (j + (side > 0 ? 1 : 0)) * Math.PI;
              const foot = footPose(
                stridePhase,
                moving ? 0.26 * g.stride * pose.reach : 0,
                moving ? 0.16 : 0,
              );
              if (pose.digging && j === 1) {
                foot.x = Math.cos(pose.beat + side) * 0.22;
                foot.y = Math.max(0, Math.sin(pose.beat + side)) * 0.18;
              }
              const hipY = height * 0.85;
              const kneeX = x + foot.x * 0.5 - 0.07;
              const kneeY = (hipY + foot.y) * 0.5;
              const legZ = side * 0.24;
              const segment = (
                x1: number,
                y1: number,
                x2: number,
                y2: number,
              ) => {
                part(
                  limb,
                  (x1 + x2) / 2,
                  (y1 + y2) / 2,
                  legZ,
                  0.095,
                  Math.hypot(x2 - x1, y2 - y1),
                  0.105,
                  dark,
                  0,
                  0,
                  -Math.atan2(x2 - x1, y2 - y1),
                );
              };
              segment(x, hipY, kneeX, kneeY);
              segment(kneeX, kneeY, x + foot.x, 0.06 + foot.y);
              part(
                round,
                x + foot.x + 0.035,
                0.06 + foot.y,
                legZ,
                0.13,
                0.065,
                0.09,
                light,
              );
              continue;
            }
            if (bug) {
              // Front and rear legs move together with the opposite middle leg.
              const step = footPose(
                phase + (j + (side > 0 ? 1 : 0)) * Math.PI,
                moving ? 0.19 * g.stride : 0,
                moving ? 0.09 : 0,
              );
              const tipX = x + (j - 1) * 0.15 + step.x;
              const tipY = 0.025 + step.y;
              const tipZ = side * (0.24 + 0.32 * g.limbs);
              const kneeX = (x + tipX) / 2;
              const kneeY = 0.22 + step.y * 0.4;
              const kneeZ = side * (0.23 + 0.15 * g.limbs);
              const leg = (
                ax: number,
                ay: number,
                az: number,
                bx: number,
                by: number,
                bz: number,
              ) => {
                const dx = bx - ax,
                  dy = by - ay,
                  dz = bz - az;
                // Rotate the local Y axis onto the segment (Euler XYZ).
                part(
                  limb,
                  (ax + bx) / 2,
                  (ay + by) / 2,
                  (az + bz) / 2,
                  0.045,
                  Math.hypot(dx, dy, dz),
                  0.045,
                  dark,
                  Math.atan2(dz, dy),
                  0,
                  -Math.atan2(dx, Math.hypot(dy, dz)),
                );
              };
              leg(x, 0.19, side * 0.19, kneeX, kneeY, kneeZ);
              leg(kneeX, kneeY, kneeZ, tipX, tipY, tipZ);
              continue;
            }
            part(
              limb,
              x,
              height * 0.45,
              side * 0.24,
              0.13,
              height * 0.9,
              0.13,
              dark,
              0,
              0,
              swing * side * (j % 2 ? 1 : -1),
            );
          }
        for (let j = 0; j < Math.floor(g.markings * 5); j++)
          part(
            round,
            (j - 2) * 0.16 * g.length,
            height +
              (mouseLook
                ? 0.32 *
                  look.coat *
                  Math.sqrt(1 - Math.pow(((j - 2) * 0.16) / 0.57, 2))
                : 0.31),
            0,
            mouseLook ? 0.13 * mouseLook.patch : 0.085,
            mouseLook ? 0.045 : 0.025,
            mouseLook ? 0.21 * look.coat : 0.12,
            dark,
          );
      }
      if (pose.digging) {
        // A fixed small batch of soil flecks; no particles allocated or simulated.
        for (let j = 0; j < 3; j++) {
          const t = (a.age * 2 + j / 3) % 1;
          part(
            round,
            0.35 - t * 0.7,
            0.05 + Math.sin(t * Math.PI) * 0.16,
            (j - 1) * 0.15,
            0.035,
            0.03,
            0.035,
            new THREE.Color("#8c7351"),
          );
        }
      }
      if ((pose.eating && a.species !== "snake") || pose.drinking) {
        part(
          round,
          headX + 0.23,
          headY - 0.08,
          0,
          0.12,
          0.025 + (1 + Math.sin(pose.beat)) * 0.018,
          0.1,
          dark,
        );
        if (pose.drinking && a.species !== "fish")
          part(
            round,
            headX + 0.25,
            0.03,
            0,
            0.16,
            0.008,
            0.12,
            new THREE.Color("#a9d8d3"),
          );
      }
      // A visible mouthful shrinks with the parent's available food reserve.
      if (care.carrying > 0 || care.feeding) {
        const amount = Math.max(0.35, Math.min(1, care.carrying / 12));
        const mouth = headX + (a.species === "bird" ? 0.52 : 0.35);
        const foodColor = new THREE.Color(
          a.species === "mouse"
            ? "#85a14e"
            : a.species === "bird" && a.birdDiet === "insectivore"
              ? "#d69b76"
              : "#bd7256",
        );
        const pieces =
          a.species === "bird" && a.birdDiet === "insectivore" ? 3 : 1;
        for (let j = 0; j < pieces; j++)
          part(
            round,
            mouth,
            headY - 0.07 - j * 0.1,
            Math.sin(j * 1.8) * 0.06,
            (pieces === 3 ? 0.065 : 0.14) * amount,
            0.11 * amount,
            (pieces === 3 ? 0.065 : 0.12) * amount,
            foodColor,
          );
        // Small morsel moving from the parent's mouth toward the waiting young.
        if (care.feeding)
          part(
            round,
            mouth + pulse * 0.42,
            headY - pulse * 0.25,
            0,
            0.07,
            0.07,
            0.07,
            foodColor,
          );
      }
      if (care.begging || care.chewing) {
        // Open mouth and raised head are distinct from ordinary walking or sleep.
        part(
          round,
          headX + 0.25,
          headY - 0.02,
          0,
          0.16,
          care.chewing ? 0.035 + pulse * 0.03 : 0.07 + pulse * 0.07,
          0.14,
          new THREE.Color("#5c302d"),
        );
        if (care.begging)
          for (const side of [-1, 1])
            part(
              limb,
              0.15,
              headY + 0.04,
              side * 0.35,
              0.2,
              0.06,
              0.24,
              light,
              side * (0.4 + pulse * 0.5),
            );
      }
      const eyeZ =
        a.species === "snake" ? Math.sin(phase) * 0.22 * g.stride : 0;
      for (const side of hasAquaticModel(a) ? [] : [-1, 1])
        part(
          this.eyes,
          headX + 0.16,
          headY + (a.species === "snake" ? 0.055 : 0.08),
          eyeZ + side * (a.species === "snake" ? 0.105 : 0.18),
          0.05 * look.eye,
          0.05 * look.eye,
          0.05 * look.eye,
          new THREE.Color("#ffffff"),
        );
    }
    for (const p of refreshPlants ? plants : []) {
      const mesh = this.plantVariants[p.kind][p.variety ?? 0];
      const form = plantAppearance(p);
      const life = plantLifeVisuals(p);
      const size = life.size;
      this.dummy.position.set(p.x, terrainHeight(p.x, p.z, land), p.z);
      this.dummy.rotation.set(0, p.id, 0);
      this.dummy.scale.set(
        size *
          (p.kind === "tree" ? 1.9 : p.kind === "bush" ? 0.65 : 0.4) *
          form.crown *
          life.foliage,
        size *
          (p.kind === "tree" ? 2.2 : p.kind === "bush" ? 0.7 : 0.4) *
          (0.85 + p.defense * 0.4) *
          life.droop,
        size *
          (p.kind === "tree" ? 1.9 : p.kind === "bush" ? 0.65 : 0.4) *
          form.crown *
          life.foliage,
      );
      if (p.kind === "bush" && p.variety === 2) {
        this.dummy.scale.x *= 1 - life.damage * 0.26;
        this.dummy.scale.z *= 1 - life.damage * 0.26;
        this.dummy.scale.y *= 1 - life.damage * 0.18;
      }
      put(mesh, p.id);
      this.color.set(
        p.kind === "grass"
          ? "#95ad56"
          : p.kind === "bush"
            ? "#698c50"
            : "#416e51",
      );
      this.color.offsetHSL(p.defense * 0.03, 0, p.growth * 0.035);
      if (p.kind === "grass") {
        const wilt = mesh.geometry.getAttribute("wilt");
        wilt.setX(mesh.count - 1, life.wilt);
        wilt.needsUpdate = true;
        this.color.lerp(this.shootColor, life.newGrowth);
      }
      this.color.lerp(
        this.dryPlantColor,
        Math.max(life.aging * 0.85, life.damage),
      );
      this.color.lerp(new THREE.Color("#b6a16a"), life.drought * 0.65);
      this.color.lerp(new THREE.Color("#a4ad78"), life.flooding * 0.65);
      if (p.kind === "bush" && p.variety === 2) {
        const age = life.lifespanFraction;
        const maturity = p.age / PLANTS.bush.maturity;
        const ground = this.dummy.position.y;
        const { x: width, y: height, z: depth } = this.dummy.scale;
        this.color.set("#4c9866").lerp(this.dryPlantColor, life.damage)
          .lerp(this.weatheredCactus, THREE.MathUtils.smoothstep(age, 0.85, 0.98));
        for (const side of [-1, 1]) {
          const start = side === 1 ? 0.69 : 0.78;
          const fall = THREE.MathUtils.smoothstep(age, start, start + 0.13);
          const fade = THREE.MathUtils.smoothstep(age, start + 0.14, start + 0.20);
          const scale = THREE.MathUtils.smoothstep(maturity, 0.22, 0.94) * (1 - fade);
          if (scale <= 0) continue;
          const yaw = p.id + (side === 1 ? 0 : Math.PI);
          const reach = width * (0.14 + fall * 0.45);
          this.dummy.position.set(p.x + reach * Math.cos(yaw),
            ground + height * THREE.MathUtils.lerp(side === 1 ? 0.76 : 0.49, 0.12, fall * fall),
            p.z - reach * Math.sin(yaw));
          this.dummy.rotation.set(fall * Math.PI / 2, yaw, -fall * 0.75, "YXZ");
          // Roll the detached elbow onto its side so it rests flat on the soil.
          this.dummy.scale.set(width * scale, height * scale, depth * scale);
          put(this.cactusArms, p.id);
          this.cactusArms.setColorAt(this.cactusArms.count - 1, this.color);
        }
        const bloom = THREE.MathUtils.smoothstep(maturity, 0.92, 1.14) *
          (1 - THREE.MathUtils.smoothstep(age, 0.64, 0.74)) *
          THREE.MathUtils.smoothstep(p.health, 12, 70);
        if (bloom > 0) {
          this.dummy.position.set(p.x, ground + 1.64 * height, p.z);
          this.dummy.rotation.set(0, p.id, 0);
          this.dummy.scale.set(width * bloom, height * bloom, depth * bloom);
          put(this.cactusFlower, p.id);
        }
        this.dummy.rotation.order = "XYZ";
      }
      mesh.setColorAt(mesh.count - 1, this.color);
      if (
        (p.kind === "grass" && p.variety === 2) ||
        (p.kind === "bush" && p.variety === 1)
      ) {
        const y = this.dummy.position.y;
        this.dummy.position.y =
          y + (p.kind === "grass" ? 0.65 : 0.8) * this.dummy.scale.y;
        if (p.kind === "grass") {
          // Bend the flower head around the same rooted stem as its foliage.
          const arch = life.wilt * 0.65 ** 2;
          const dx = 0.64 * arch * this.dummy.scale.x,
            dz = 0.22 * arch * this.dummy.scale.z;
          this.dummy.position.x += dx * Math.cos(p.id) + dz * Math.sin(p.id);
          this.dummy.position.z += dz * Math.cos(p.id) - dx * Math.sin(p.id);
          this.dummy.position.y -= 0.9 * arch * this.dummy.scale.y;
          this.dummy.rotation.z = -life.wilt * 0.85;
        }
        if (p.kind === "grass") {
          const open = THREE.MathUtils.smoothstep(1 - life.newGrowth, 0.35, 0.96);
          const { x, y: headY, z } = this.dummy.position;
          const { x: width, y: height } = this.dummy.scale;
          for (let petal = 0; petal < 5; petal++) {
            const angle = p.id + petal * Math.PI * 2 / 5;
            const fall = THREE.MathUtils.smoothstep(Math.max(life.aging, life.damage), 0.45 + petal * 0.075, 0.7 + petal * 0.07);
            if (fall >= 1) continue;
            const radius = width * (0.025 + open * 0.14 + fall * 0.55);
            this.dummy.position.set(
              x + radius * Math.cos(angle),
              THREE.MathUtils.lerp(headY + height * 0.055 * (1 - open), y + 0.01, fall * fall),
              z + radius * Math.sin(angle),
            );
            this.dummy.rotation.set(0, -angle, (1 - open) * 1.15 - fall * 0.6, "YXZ");
            const length = width * (0.055 + open * 0.11) * (1 - fall ** 5);
            this.dummy.scale.set(length, length * 0.28, length * 0.58);
            put(this.petals, p.id);
            this.petals.setColorAt(this.petals.count - 1, this.color.set("#bed184").lerp(this.bloomColor, open));
          }
          this.dummy.rotation.set(0, p.id, 0, "XYZ");
        } else {
          put(this.accents, p.id);
          this.accents.setColorAt(this.accents.count - 1, this.color.set("#b85369"));
        }
        this.dummy.position.y = y;
      }
      if (p.kind === "tree") {
        this.dummy.scale.x *= form.trunk / (form.crown * life.foliage);
        this.dummy.scale.z *= form.trunk / (form.crown * life.foliage);
        this.dummy.position.y =
          terrainHeight(p.x, p.z, land) + 0.9 * this.dummy.scale.y;
        put(this.trunks, p.id);
      }
    }
    if (refreshPlants)
      for (const p of remains) {
        const y = terrainHeight(p.x, p.z, land);
        const tree = p.kind === "tree",
          grass = p.kind === "grass";
        const scale = p.size * (tree ? 2.2 : grass ? 0.4 : 0.7);
        const foliage = Math.max(0, 1 - p.decay * 4);
        if (foliage > 0) {
          this.dummy.position.set(p.x, y, p.z);
          this.dummy.rotation.set(0, p.id, 0);
          this.dummy.scale.set(
            scale * foliage,
            scale * foliage,
            scale * foliage,
          );
          const m = this.plantVariants[p.kind][p.variety];
          put(m, p.id);
          m.setColorAt(m.count - 1, this.dryPlantColor);
        }
        if (!grass) {
          this.dummy.position.set(p.x, y + 0.05, p.z);
          this.dummy.rotation.set(
            0,
            p.id,
            (Math.min(1, Math.max(0, (p.decay - 0.25) / 0.4)) * Math.PI) / 2,
          );
          const shrink = 1 - Math.max(0, p.decay - 0.6) / 0.4;
          this.dummy.scale.setScalar(scale * shrink);
          put(this.deadWood, p.id);
          const cell = landAt(land, p.x, p.z);
          if (
            tree &&
            p.decay > 0.08 &&
            cell.fungus > 0.04 &&
            cell.moisture > 0.25
          ) {
            this.dummy.updateMatrix();
            const woodMatrix = this.dummy.matrix.clone();
            const count = Math.min(5, 1 + Math.floor(cell.fungus * 5));
            for (let i = 0; i < count; i++) {
              this.dummy.position
                .set(0.12, 0.35 + i * 0.34, (i % 2 ? -1 : 1) * 0.12)
                .applyMatrix4(woodMatrix);
              this.dummy.rotation.set(0, i + p.id, 0);
              this.dummy.scale.setScalar(0.5 + cell.fungus * 0.5);
              put(this.woodMushrooms, p.id);
            }
          }
        }
        this.dummy.position.set(p.x, y + 0.04, p.z);
        this.dummy.rotation.set(0, p.id, 0);
        this.dummy.scale.set(
          scale * (0.5 + p.decay),
          0.04 * (1 - p.decay),
          scale * (0.4 + p.decay),
        );
        put(this.leafLitter, p.id);
      }
    if (refreshPlants)
      for (const c of carcasses) {
        const size = Math.cbrt(c.size) * (1 - c.decay);
        this.dummy.position.set(
          c.x,
          terrainHeight(c.x, c.z, land) + size * 0.12,
          c.z,
        );
        this.dummy.rotation.set(0, c.id, 0);
        this.dummy.scale.set(size * 0.4, size * 0.16, size * 0.22);
        put(this.carcassMesh, c.id);
      }
    for (const mesh of updatedMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
