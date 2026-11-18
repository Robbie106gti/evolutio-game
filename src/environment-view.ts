import * as THREE from "three";
import { type World } from "./sim.ts";
import {
  WORLD_RADIUS,
  terrainHeight,
  LAND_SIDE,
  LAND_MIN,
  LAND_STEP,
  ROCKS,
  RIVER_MIN,
  RIVER_MAX,
  riverX,
  riverFlow,
  riverWidth,
  riverWidthAt,
} from "./terrain";
import { climate, regionalClimate } from "./ecology";
export class EnvironmentView {
  rockMeshes: THREE.Mesh[] = [];
  mushroomCells: number[] = [];
  mushroomPositions: { x: number; z: number }[] = [];
  waterfall: THREE.Mesh;
  currents: THREE.LineSegments;
  mist: THREE.Sprite;
  foam: THREE.Mesh;
  dens = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.6, 1, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: "#66503a", roughness: 1 }),
    120,
  );
  holes = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.4, 20),
    new THREE.MeshBasicMaterial({ color: "#302b23", side: THREE.DoubleSide }),
    120,
  );
  home = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 32),
    new THREE.MeshBasicMaterial({ color: "#f2c770", side: THREE.DoubleSide }),
  );
  mushrooms = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.48, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: "#bb7550" }),
    LAND_SIDE * LAND_SIDE * 3,
  );
  stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.13, 0.65, 6),
    new THREE.MeshStandardMaterial({ color: "#e4d6b8" }),
    LAND_SIDE * LAND_SIDE * 3,
  );
  eggs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#eee1b9" }),
    560,
  );
  clouds = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: "#eef4ed",
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    LAND_SIDE * LAND_SIDE * 3,
  );
  cloudShade: THREE.InstancedMesh;
  catches = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: "#927568", roughness: 1 }),
    560,
  );
  rain: THREE.LineSegments;
  dummy = new THREE.Object3D();
  constructor(scene: THREE.Scene, world: World) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!,
      gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(20,35,50,.2)");
    gradient.addColorStop(1, "rgba(20,35,50,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const cloudCanvas = document.createElement("canvas");
    cloudCanvas.width = 256;
    cloudCanvas.height = 128;
    const cloudCtx = cloudCanvas.getContext("2d")!;
    for (let j = 0; j < 5; j++) {
      const x = 40 + j * 42,
        y = 65 + Math.sin(j * 2) * 14,
        r = 35 + (j % 3) * 8;
      const puff = cloudCtx.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, "rgba(245,248,243,.85)");
      puff.addColorStop(0.45, "rgba(245,248,243,.65)");
      puff.addColorStop(1, "rgba(245,248,243,0)");
      cloudCtx.fillStyle = puff;
      cloudCtx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.mist = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(cloudCanvas),
        color: "#d7e9e7",
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.mist.position.set(riverX(RIVER_MAX), 0.1, RIVER_MAX + 2.6);
    this.mist.scale.set(5, 3, 1);
    scene.add(this.mist);
    const fallGeo = new THREE.BufferGeometry();
    fallGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(8 * 18), 3),
    );
    this.waterfall = new THREE.Mesh(
      fallGeo,
      new THREE.MeshBasicMaterial({
        color: "#88c7d0",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.waterfall.frustumCulled = false;
    scene.add(this.waterfall);
    this.foam = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.8, 32),
      new THREE.MeshBasicMaterial({
        color: "#deefed",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.set(riverX(RIVER_MAX), -1.44, RIVER_MAX + 2.6);
    scene.add(this.foam);
    const currentGeo = new THREE.BufferGeometry();
    currentGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(56 * 6), 3),
    );
    this.currents = new THREE.LineSegments(
      currentGeo,
      new THREE.LineBasicMaterial({
        color: "#d4efed",
        transparent: true,
        opacity: 0.55,
      }),
    );
    this.currents.frustumCulled = false;
    scene.add(this.currents);
    this.clouds.material.map = new THREE.CanvasTexture(cloudCanvas);
    this.clouds.material.needsUpdate = true;
    this.cloudShade = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      LAND_SIDE * LAND_SIDE,
    );
    this.clouds.count = this.cloudShade.count = 0;
    this.clouds.frustumCulled = this.cloudShade.frustumCulled = false;
    scene.add(this.clouds, this.cloudShade);
    for (const r of ROCKS) {
      const rock = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshStandardMaterial({
          color: "#8d9182",
          roughness: 1,
          flatShading: true,
        }),
      );
      rock.position.set(r.x, 0.65 + r.height * 0.35, r.z);
      rock.scale.set(r.radius, r.height, r.radius * 0.8);
      rock.rotation.y = r.x;
      rock.castShadow = rock.receiveShadow = true;
      scene.add(rock);
      this.rockMeshes.push(rock);
    }
    this.rockMeshes.forEach((m, i) => {
      const r = ROCKS[i];
      m.position.y =
        terrainHeight(r.x, r.z, world.weather.land) + r.height * 0.35;
    });
    this.dens.count = this.holes.count = 0;
    this.dens.frustumCulled = this.holes.frustumCulled = false;
    scene.add(
      this.dens,
      this.holes,
      this.mushrooms,
      this.stems,
      this.eggs,
      this.catches,
    );
    this.catches.count = 0;
    this.catches.frustumCulled = false;
    this.eggs.count = 0;
    this.eggs.frustumCulled = false;
    this.mushrooms.count = this.stems.count = 0;
    this.mushrooms.castShadow = true;
    this.stems.castShadow = true;
    this.mushrooms.frustumCulled = this.stems.frustumCulled = false;
    this.home.rotation.x = -Math.PI / 2;
    this.home.visible = false;
    scene.add(this.home);
    const points = new Float32Array(240 * 6);
    for (let i = 0; i < 240; i++) {
      const angle = i * 2.399,
        r = Math.sqrt((i + 0.5) / 240) * WORLD_RADIUS;
      const x = Math.cos(angle) * r,
        z = Math.sin(angle) * r,
        y = ((i % 19) / 19) * 8;
      points.set([x, y, z, x - 0.12, y + 0.5, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(points, 3));
    this.rain = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: "#c2e5ec",
        transparent: true,
        opacity: 0.4,
      }),
    );
    scene.add(this.rain);
  }
  update(
    world: World,
    selected: number,
    scene: THREE.Scene,
    sun: THREE.DirectionalLight,
    ambient: THREE.HemisphereLight,
  ) {
    const c = climate(world.time, world.weather);
    const flow = riverFlow(world.ponds),
      width = riverWidth(world.ponds);
    const fall = (t: number, side: number) => [
      riverX(RIVER_MAX) + side * width,
      0.69 - 2.2 * Math.pow(t, 1.4),
      RIVER_MAX + 2.6 * t,
    ];
    const fallPositions = this.waterfall.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    let fi = 0;
    for (let i = 0; i < 8; i++) {
      const t = i / 8,
        u = (i + 1) / 8;
      for (const point of [
        fall(t, -1),
        fall(u, -1),
        fall(t, 1),
        fall(t, 1),
        fall(u, -1),
        fall(u, 1),
      ])
        fallPositions.setXYZ(fi++, point[0], point[1], point[2]);
    }
    fallPositions.needsUpdate = true;
    this.foam.scale.setScalar(1 + 0.1 * Math.sin(world.time * 2) * flow);
    this.mist.material.opacity = 0.22 + 0.08 * flow;
    const currentPositions = this.currents.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < 32; i++) {
      const z =
          RIVER_MIN +
          (((i * (RIVER_MAX - RIVER_MIN)) / 32 + world.time * 2 * flow) %
            (RIVER_MAX - RIVER_MIN)),
        x = riverX(z) + Math.sin(i * 7) * riverWidthAt(z, world.ponds) * 0.5;
      currentPositions.setXYZ(i * 2, x - 0.18, 0.705, z);
      currentPositions.setXYZ(i * 2 + 1, x + 0.18, 0.705, z);
    }
    for (let i = 0; i < 24; i++) {
      const t = (world.time * 0.8 * flow + i / 24) % 1,
        side = Math.sin(i * 5) * 0.9,
        a = fall(t, side),
        b = fall(Math.min(1, t + 0.07), side);
      currentPositions.setXYZ(64 + i * 2, a[0], a[1] + 0.02, a[2]);
      currentPositions.setXYZ(65 + i * 2, b[0], b[1] + 0.02, b[2]);
    }
    currentPositions.needsUpdate = true;

    let catchCount = 0;
    for (const a of world.animals)
      if (a.mealEnergy > 0) {
        this.dummy.position.set(
          a.mealX,
          terrainHeight(a.mealX, a.mealZ, world.weather.land) + 0.15,
          a.mealZ,
        );
        this.dummy.rotation.set(0, a.id, 0);
        const size = 0.2 + 0.5 * Math.min(1, a.mealEnergy / 90);
        this.dummy.scale.set(size, 0.16, size * 0.6);
        this.dummy.updateMatrix();
        this.catches.setMatrixAt(catchCount++, this.dummy.matrix);
      }
    this.catches.count = catchCount;
    this.catches.instanceMatrix.needsUpdate = true;
    this.eggs.count = world.eggs.length;
    world.eggs.forEach((e, i) => {
      this.dummy.position.set(
        e.embryo.x +
          (e.embryo.nursery?.kind === "nest"
            ? Math.cos(e.embryo.id * 2.4) * 0.14
            : 0),
        terrainHeight(e.embryo.x, e.embryo.z, world.weather.land) +
          e.embryo.altitude +
          0.18,
        e.embryo.z +
          (e.embryo.nursery?.kind === "nest"
            ? Math.sin(e.embryo.id * 2.4) * 0.14
            : 0),
      );
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(e.buried ? 0.4 : 1);
      this.eggs.setColorAt(
        i,
        new THREE.Color(e.buried ? "#978363" : "#eee1b9"),
      );
      this.dummy.updateMatrix();
      this.eggs.setMatrixAt(i, this.dummy.matrix);
    });
    this.eggs.instanceMatrix.needsUpdate = true;
    if (this.eggs.instanceColor) this.eggs.instanceColor.needsUpdate = true;
    let cloudCount = 0,
      shadeCount = 0;
    for (let i = 0; i < LAND_SIDE * LAND_SIDE; i++) {
      const x = LAND_MIN + (i % LAND_SIDE) * LAND_STEP,
        z = LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP;
      if (Math.hypot(x, z) > WORLD_RADIUS - 2) continue;
      const local = regionalClimate(world.time, world.weather, x, z),
        density = Math.max(0, local.cloud - 0.35);
      if (density < 0.02) continue;
      if (Math.sin(i * 17.31) > 0.25) {
        this.dummy.position.set(
          x + Math.sin(i * 2.7) * 3,
          10 + Math.sin(i),
          z + Math.cos(i * 4.1) * 3,
        );
        this.dummy.rotation.set(-Math.PI / 2, 0, Math.sin(i) * 0.3);
        this.dummy.scale.set(12 + density * 8, 7 + density * 4, 1);
        this.dummy.updateMatrix();
        this.clouds.setMatrixAt(cloudCount++, this.dummy.matrix);
      }
      this.dummy.position.set(
        x,
        terrainHeight(x, z, world.weather.land) + 0.016,
        z,
      );
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.setScalar(8 + 12 * density);
      this.dummy.updateMatrix();
      this.cloudShade.setMatrixAt(shadeCount++, this.dummy.matrix);
    }
    this.clouds.material.color
      .set("#91a7ad")
      .lerp(new THREE.Color("#ffffff"), c.light);
    this.clouds.count = cloudCount;
    this.cloudShade.count = shadeCount;
    this.clouds.instanceMatrix.needsUpdate =
      this.cloudShade.instanceMatrix.needsUpdate = true;
    this.mushroomCells = [];
    this.mushroomPositions = [];
    let count = 0;
    world.weather.land?.forEach((cell, i) => {
      if (cell.fungus < 0.06) return;
      for (let j = 0; j < 3; j++) {
        const x =
            LAND_MIN + (i % LAND_SIDE) * LAND_STEP + Math.sin(i * 7 + j) * 2,
          z =
            LAND_MIN +
            Math.floor(i / LAND_SIDE) * LAND_STEP +
            Math.cos(i * 3 + j) * 2;
        if (Math.hypot(x, z) > WORLD_RADIUS - 1) continue;
        const base = terrainHeight(x, z, world.weather.land),
          scale = 0.22 + cell.fungus * 0.16;
        this.mushroomCells.push(i);
        this.mushroomPositions.push({ x, z });
        this.dummy.position.set(x, base + 0.65 * scale, z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        this.mushrooms.setMatrixAt(count, this.dummy.matrix);
        this.dummy.position.y = base + 0.325 * scale;
        this.dummy.updateMatrix();
        this.stems.setMatrixAt(count++, this.dummy.matrix);
      }
    });
    this.mushrooms.count = this.stems.count = count;
    this.mushrooms.instanceMatrix.needsUpdate =
      this.stems.instanceMatrix.needsUpdate = true;
    sun.intensity = 0.25 + c.sunlight * 2.75;
    sun.color.set(
      c.sunlight < 0.12 ? "#a6c9ff" : c.sunlight < 0.4 ? "#edb68f" : "#ffecd2",
    );
    ambient.intensity = 0.55 + c.light * 1.95;
    const sky = new THREE.Color("#172c43").lerp(
      new THREE.Color("#92c6e7"),
      Math.min(1, c.sunlight * 2),
    );
    scene.background = sky;
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(sky);
    this.rockMeshes.forEach((m, i) => {
      const r = ROCKS[i];
      m.position.y =
        terrainHeight(r.x, r.z, world.weather.land) + r.height * 0.35;
    });
    this.dens.count = this.holes.count = world.dens.length;
    world.dens.forEach((d, i) => {
      this.dummy.position.set(
        d.x,
        terrainHeight(d.x, d.z, world.weather.land) + d.progress * 0.08,
        d.z,
      );
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0.5 + d.progress * 0.5);
      this.dummy.updateMatrix();
      this.dens.setMatrixAt(i, this.dummy.matrix);
      this.dummy.rotation.x = -Math.PI / 2;
      this.dummy.position.y =
        terrainHeight(d.x, d.z, world.weather.land) + 0.25;
      this.dummy.scale.setScalar(d.progress);
      this.dummy.updateMatrix();
      this.holes.setMatrixAt(i, this.dummy.matrix);
    });
    this.dens.instanceMatrix.needsUpdate =
      this.holes.instanceMatrix.needsUpdate = true;
    const animal = world.animals.find((a) => a.id === selected),
      home = world.dens.find((d) => d.id === animal?.home);
    this.home.visible = !!home;
    if (home)
      this.home.position.set(
        home.x,
        terrainHeight(home.x, home.z, world.weather.land) + 0.28,
        home.z,
      );
    this.rain.visible = true;
    const drops = this.rain.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < drops.count; i += 2) {
      const x = drops.getX(i),
        z = drops.getZ(i);
      const wet = regionalClimate(world.time, world.weather, x, z).rain > 0.2;
      const y = wet ? ((i % 19) / 19) * 8 : -30;
      drops.setY(i, y);
      drops.setY(i + 1, wet ? y + 0.5 : y);
    }
    drops.needsUpdate = true;
    this.rain.position.y = 1 - ((world.time * 5) % 3);
  }
}
