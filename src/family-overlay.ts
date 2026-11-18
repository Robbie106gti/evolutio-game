import { terrainHeight } from "./terrain";
import * as THREE from "three";
import { selectedFamily } from "./family";
import { type World } from "./sim.ts";
import { growthScale } from "./biology.ts";

export class FamilyOverlay {
  rings = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.94, 1.04, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    560,
  );
  dummy = new THREE.Object3D();
  color = new THREE.Color();
  constructor(scene: THREE.Scene) {
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    scene.add(this.rings);
  }
  update(world: World, id: number) {
    const family = selectedFamily(world, id);
    this.rings.count = 0;
    const members = [
      ...(family.parent ? [{ animal: family.parent, color: "#4cb6d3" }] : []),
      ...(family.otherParent
        ? [{ animal: family.otherParent, color: "#4cb6d3" }]
        : []),
      ...family.children.map((animal) => ({ animal, color: "#b07ae2" })),
    ];
    for (const { animal, color } of members) {
      if (this.rings.count === this.rings.instanceMatrix.count) break;
      this.dummy.position.set(
        animal.x,
        terrainHeight(animal.x, animal.z, world.weather.land) + 0.04,
        animal.z,
      );
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.setScalar(
        Math.max(0.65, animal.genes.size * growthScale(animal) * 1.25),
      );
      this.dummy.updateMatrix();
      this.rings.setMatrixAt(this.rings.count, this.dummy.matrix);
      this.rings.setColorAt(this.rings.count, this.color.set(color));
      this.rings.count++;
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    return family;
  }
}
