import * as THREE from "three";
import type { Animal } from "./model.ts";
import type { World } from "./sim.ts";
import { terrainHeight } from "./terrain.ts";

function activity(a: Animal) {
  switch (a.state) {
    case "Challenging rival":
    case "Retreating from rival":
      return "rivalry";
    case "Courting":
      return "courtship";
    default:
      if (a.reproductive?.transitionDue !== undefined) return "changing";
      return a.reproductive?.due === undefined ? undefined : "expecting";
  }
}
export const breedingAnimals = (world: World) =>
  world.naturalReproduction
    ? world.animals.filter((animal) => activity(animal))
    : [];

export class BreedingView {
  #rings = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.78, 1, 20),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthWrite: false }),
    20,
  );
  #pose = new THREE.Object3D();
  #color = new THREE.Color();
  #animals: Animal[] = [];
  constructor(scene: THREE.Scene) {
    this.#rings.frustumCulled = false;
    this.#rings.count = 0;
    this.#pose.rotation.x = -Math.PI / 2;
    scene.add(this.#rings);
  }
  setAnimals(animals: Animal[]) {
    this.#animals = animals;
  }
  draw(world: World) {
    const rings = this.#rings;
    rings.count = 0;
    for (const a of this.#animals) {
      const kind = activity(a);
      if (!kind || a.energy <= 0) continue;
      this.#pose.position.set(
        a.x,
        terrainHeight(a.x, a.z, world.weather.land) + a.altitude + 0.09,
        a.z,
      );
      this.#pose.scale.setScalar(0.8 + a.genes.size);
      this.#pose.updateMatrix();
      rings.setMatrixAt(rings.count, this.#pose.matrix);
      rings.setColorAt(
        rings.count,
        this.#color.set(
          kind === "rivalry"
            ? "#e37a47"
            : kind === "courtship"
              ? "#efabdc"
              : kind === "changing"
                ? "#75e6db"
                : "#f4d66f",
        ),
      );
      if (++rings.count === rings.instanceMatrix.count) break;
    }
    if (rings.count) {
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    }
  }
}
