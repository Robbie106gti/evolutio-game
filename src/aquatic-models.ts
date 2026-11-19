import type * as THREE from "three";
import type { Animal } from "./model.ts";
import { animalPose } from "./state-visuals.ts";

export type AnimalPart = (
  mesh: THREE.InstancedMesh,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  tint: THREE.Color,
  rx?: number,
  ry?: number,
  rz?: number,
) => void;
export const hasAquaticModel = (a: Animal) =>
  ["crocodile", "fish", "turtle", "frog"].includes(a.species);

// Reuse the game's instanced geometry and picking IDs: detail adds instances,
// not draw calls. All dimensions live inside the inherited body/growth scale.
export function aquaticModel(
  a: Animal,
  part: AnimalPart,
  meshes: Record<string, THREE.InstancedMesh>,
  eyes: THREE.InstancedMesh,
  coat: THREE.Color,
  light: THREE.Color,
  dark: THREE.Color,
  swimming = false,
) {
  const { round, limb, angular } = meshes,
    g = a.genes,
    pose = animalPose(a);
  const asleep = a.state === "Sleeping",
    motion = pose.moving ? 1 : 0;
  const wave = Math.sin(pose.phase) * motion;
  const breath = 1 + Math.sin(a.age * 1.8) * (asleep ? 0.02 : 0.008);
  let headX = 0.55 * g.length,
    headY = 0.35 - pose.headDip * 0.45;
  const eye = (x: number, y: number, z: number) => {
    part(
      eyes,
      x,
      y,
      z,
      asleep ? 0.055 : 0.045,
      asleep ? 0.012 : 0.045,
      0.035,
      dark,
    );
  };
  function walkingLeg(side: number, end: number, croc: boolean) {
    const hipX = end * (croc ? 0.48 : 0.31) * g.length;
    // Stagger the four feet, with three supporting the body during each swing.
    const offset = (side > 0 ? 0.5 : 0) + (end > 0 ? 0.75 : 0);
    const cycle =
      ((pose.phase / (2 * Math.PI)) * (croc ? 0.85 : 0.72) + offset) % 1;
    const swing = Math.max(0, (cycle - 0.75) * 4);
    const sweep =
      cycle < 0.75 ? 1 - (2 * cycle) / 0.75 : -Math.cos(Math.PI * swing);
    const footX = hipX + (croc ? 0.22 : 0.14) * g.stride * sweep;
    const lift = Math.sin(Math.PI * swing) * (croc ? 0.105 : 0.075);
    const hipZ = side * (croc ? 0.24 : 0.28),
      footZ = hipZ + side * 0.26 * g.limbs;
    const hipY = croc ? 0.19 : 0.17,
      footY = 0.035 + lift;
    const kneeX = (hipX + footX) / 2 - end * 0.07,
      kneeZ = hipZ + side * 0.14 * g.limbs;
    const kneeY = 0.145 + lift * 0.45;
    function segment(
      x: number,
      y: number,
      z: number,
      dx: number,
      dy: number,
      dz: number,
      r: number,
    ) {
      part(
        round,
        x + dx / 2,
        y + dy / 2,
        z + dz / 2,
        r,
        Math.hypot(dx, dy, dz) * 0.62,
        r,
        coat,
        Math.atan2(dz, dy),
        0,
        -Math.atan2(dx, Math.hypot(dy, dz)),
      );
    }
    segment(hipX, hipY, hipZ, kneeX - hipX, kneeY - hipY, kneeZ - hipZ, 0.09);
    segment(
      kneeX,
      kneeY,
      kneeZ,
      footX - kneeX,
      footY - kneeY,
      footZ - kneeZ,
      0.065,
    );
    part(
      round,
      footX + 0.045,
      footY,
      footZ,
      0.12,
      0.035,
      0.075,
      dark,
      0,
      -side * 0.22,
    );
  }
  if (a.species === "crocodile") {
    headX = 0.92 * g.length;
    headY = 0.27 - pose.headDip * 0.35;
    part(round, 0, 0.25, 0, 0.8 * g.length, 0.22 * breath, 0.34, coat);
    part(round, 0.1, 0.12, 0, 0.65 * g.length, 0.075, 0.3, light);
    part(round, headX - 0.12, headY + 0.03, 0, 0.34, 0.19, 0.26, coat);
    // Long flattened snout and separate lower jaw, rather than a round muzzle.
    const gape = pose.eating
      ? 0.035 + Math.abs(Math.sin(pose.beat)) * 0.045
      : 0;
    part(round, headX + 0.32, headY, 0, 0.48, 0.105, 0.21, coat);
    part(limb, headX + 0.32, headY - 0.085 - gape, 0, 0.72, 0.045, 0.35, light);
    for (const side of [-1, 1]) {
      part(
        round,
        headX - 0.04,
        headY + 0.15,
        side * 0.19,
        0.12,
        0.085,
        0.09,
        coat,
      );
      eye(headX, headY + 0.18, side * 0.24);
      part(
        eyes,
        headX + 0.66,
        headY + 0.07,
        side * 0.1,
        0.025,
        0.02,
        0.025,
        dark,
      );
      for (let j = 0; j < 5; j++)
        part(
          angular,
          (-0.55 + j * 0.23) * g.length,
          0.46,
          side * 0.14,
          0.075,
          0.09 + g.markings * 0.035,
          0.07,
          dark,
        );
    }
    for (let j = 0; j < 7; j++) {
      const taper = 1 - j / 8,
        sway = Math.sin(pose.phase - j * 0.48) * motion * 0.12 * (j / 3);
      part(
        round,
        (-0.65 - j * 0.21) * g.length,
        0.2 - j * 0.015,
        sway,
        0.27 * g.length,
        0.15 * taper,
        0.26 * taper,
        coat,
        0,
        -sway * 0.5,
      );
      if (j < 5)
        part(
          angular,
          (-0.7 - j * 0.21) * g.length,
          0.34 - j * 0.022,
          sway,
          0.07,
          0.08 * taper,
          0.07,
          dark,
        );
    }
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        if (pose.moving && !swimming) {
          walkingLeg(side, end, true);
          continue;
        }
        const step =
          Math.sin(pose.phase + (side === end ? 0 : Math.PI)) * motion;
        part(
          round,
          end * 0.48 * g.length,
          0.16,
          side * 0.36,
          0.24 * g.limbs,
          0.11,
          0.14,
          coat,
          0,
          side * (0.55 + step * 0.22),
        );
        part(
          limb,
          end * 0.48 * g.length + step * 0.07,
          0.07 + Math.max(0, step) * 0.045,
          side * 0.49,
          0.22 * g.limbs,
          0.065,
          0.16,
          dark,
          0,
          side * 0.25,
        );
      }
  } else if (a.species === "fish") {
    headX = 0.53 * g.length;
    headY = 0.3;
    part(round, 0, 0.3, 0, 0.65 * g.length, 0.3 * breath, 0.2, coat);
    part(round, 0.37 * g.length, 0.28, 0, 0.31, 0.24, 0.19, light);
    // Narrow caudal peduncle, broad vertical tail and upright dorsal fin.
    part(round, -0.62 * g.length, 0.29, wave * 0.06, 0.24, 0.13, 0.09, coat);
    for (const side of [-1, 1])
      part(
        angular,
        -0.88 * g.length,
        0.3 + side * 0.13,
        wave * 0.16,
        0.12,
        0.38,
        0.045,
        dark,
        0,
        wave * 0.3,
        side * 0.7,
      );
    part(angular, -0.1, 0.62, 0, 0.24, 0.25, 0.035, dark, 0, 0, 0.25);
    for (const side of [-1, 1]) {
      part(
        angular,
        0.03,
        0.2,
        side * 0.22,
        0.13,
        0.32 * g.limbs,
        0.035,
        light,
        side * (0.9 + wave * 0.15),
        0,
        0.7,
      );
      part(round, 0.24, 0.3, side * 0.185, 0.045, 0.19, 0.018, dark);
      eye(headX + 0.05, 0.36, side * 0.17);
    }
    for (let j = 0; j < Math.floor(g.markings * 5); j++)
      part(
        round,
        (-0.3 + j * 0.12) * g.length,
        0.48,
        0,
        0.035,
        0.06,
        0.16,
        dark,
      );
  } else if (a.species === "turtle") {
    const tuck = asleep ? 0.5 : 1;
    headX = 0.62 * g.length * tuck;
    part(round, 0, 0.17, 0, 0.56 * g.length, 0.1, 0.47, light);
    part(round, -0.04, 0.36, 0, 0.59 * g.length, 0.36 * breath, 0.5, dark);
    // Raised scutes follow the dome instead of floating spikes.
    for (const row of [-1, 0, 1])
      for (let j = 0; j < 3; j++)
        part(
          round,
          (-0.3 + j * 0.27) * g.length,
          0.65 - Math.abs(row) * 0.1,
          row * 0.26,
          0.16 * g.length,
          0.055,
          0.15,
          coat,
        );
    part(round, headX - 0.15, headY, 0, 0.25 * tuck, 0.12, 0.14, coat);
    part(round, headX, headY + 0.02, 0, 0.19, 0.14, 0.16, light);
    for (const side of [-1, 1]) {
      eye(headX + 0.09, headY + 0.075, side * 0.13);
      for (const end of [-1, 1]) {
        if (pose.moving && !swimming) {
          walkingLeg(side, end, false);
          continue;
        }
        part(
          round,
          end * 0.34 * g.length,
          0.12,
          side * (asleep ? 0.32 : 0.46),
          0.25 * g.limbs,
          0.08,
          0.14,
          coat,
          0,
          side * (0.45 + wave * end * 0.25),
        );
      }
    }
    part(
      angular,
      -0.65 * g.length,
      0.12,
      0,
      0.08,
      0.28,
      0.08,
      coat,
      0,
      0,
      Math.PI / 2,
    );
  } else {
    headX = 0.4 * g.length;
    headY = 0.36 - pose.headDip * 0.4;
    part(round, -0.1, 0.29, 0, 0.45 * g.length, 0.27 * breath, 0.32, coat);
    part(round, headX, headY, 0, 0.3, 0.2, 0.31, coat);
    part(round, headX + 0.06, headY - 0.12, 0, 0.24, 0.08, 0.26, light);
    for (const side of [-1, 1]) {
      part(
        round,
        headX - 0.03,
        headY + 0.17,
        side * 0.22,
        0.12,
        0.12,
        0.11,
        light,
      );
      eye(headX + 0.03, headY + 0.2, side * 0.26);
      const kick = pose.frogHop;
      part(
        round,
        -0.34 * g.length,
        0.18,
        side * 0.33,
        0.29 * g.limbs,
        0.17,
        0.19,
        coat,
        0,
        side * (0.4 - kick * 0.65),
      );
      part(
        limb,
        -0.42 * g.length - kick * 0.23,
        0.085,
        side * 0.48,
        0.34 * g.limbs,
        0.075,
        0.11,
        light,
        0,
        side * (0.8 - kick),
      );
      part(
        round,
        0.31,
        0.13,
        side * 0.3,
        0.1,
        0.17 * g.limbs,
        0.09,
        coat,
        0,
        0,
        -0.35,
      );
      part(limb, 0.43, 0.045, side * 0.34, 0.19, 0.04, 0.17, dark);
      for (let j = 0; j < Math.floor(g.markings * 4); j++)
        part(
          round,
          -0.3 + j * 0.15,
          0.49,
          side * 0.16,
          0.055,
          0.025,
          0.05,
          dark,
        );
    }
  }
  return { headX, headY };
}
