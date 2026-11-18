import * as THREE from "three";
import type { World } from "./sim.ts";
import { terrainHeight } from "./terrain.ts";
import { lineageIdentity } from "./lineage-identity.ts";
export class LineageOverlay {
  private mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private colors = new Map<number, THREE.Color>();
  private scene: THREE.Scene;
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mesh = this.create(1024);
  }
  private create(capacity: number) {
    const geometry = new THREE.RingGeometry(0.65, 0.82, 20);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
      capacity,
    );
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    return mesh;
  }
  update(w: World, enabled: boolean, selected: number) {
    this.mesh.visible = enabled;
    if (!enabled) return;
    if (w.animals.length > this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      this.mesh = this.create(2 ** Math.ceil(Math.log2(w.animals.length)));
      this.scene.remove(old);
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
    }
    const focus = (
      w.animals.find((a) => a.id === selected) ??
      w.deceased.find((a) => a.id === selected)
    )?.mouseLineage?.id;
    let count = 0;
    for (const a of w.animals) {
      const lineage = a.mouseLineage;
      if (!lineage || (focus !== undefined && lineage.id !== focus)) continue;
      let color = this.colors.get(lineage.id);
      if (!color) {
        color = new THREE.Color(lineageIdentity(lineage.id).color);
        this.colors.set(lineage.id, color);
      }
      this.dummy.position.set(
        a.x,
        terrainHeight(a.x, a.z, w.weather.land) + a.altitude + 0.06,
        a.z,
      );
      this.dummy.scale.setScalar(Math.max(0.45, a.genes.size * 0.8));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count, this.dummy.matrix);
      this.mesh.setColorAt(count, color);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.colors.size > 3000) this.colors.clear();
  }
}
