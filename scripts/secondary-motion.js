import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createInertia, springStep } from './spring.mjs';
export function createSecondaryMotion(root, sway, turn) {
  const inertia = createInertia(), strands = [];
  const axis = new THREE.Vector3(), parentRotation = new THREE.Quaternion(), offset = new THREE.Quaternion();
  const yaw = { value: 0, velocity: 0 };
  let applied = false, enabled = true, grabbed = false, motion = { vx: 0, mode: 'idle', direction: 1 };
  root.traverse(bone => {
    if (!bone.isBone || !/hair/i.test(bone.name) || /(?:end|nub|dango|lace)/i.test(bone.name)) return;
    let depth = 0, ancestor = bone.parent;
    while (ancestor?.isBone && /hair/i.test(ancestor.name)) { depth++; ancestor = ancestor.parent; }
    strands.push({ bone, pose: bone.quaternion.clone(), state: { value: 0, velocity: 0 }, depth });
  });
  function restore() {
    if (!applied) return;
    for (const s of strands) s.bone.quaternion.copy(s.pose);
    applied = false;
  }
  let last = { tilt: 0, hair: 0 };
  return {
    restore,
    setGrabbed(value) { grabbed = Boolean(value); },
    setEnabled(value) { enabled = Boolean(value); if (!enabled) { restore(); inertia.reset(); for (const s of strands) s.state.value = s.state.velocity = 0; sway.rotation.z = 0; } },
    input(value) {
      if (enabled && value.dragging && Number.isFinite(motion.x) && Number.isFinite(value.x)) inertia.displace(value.x - motion.x, grabbed ? -1 : 1);
      motion = value; inertia.input(value.vx);
    },
    step(dt, facing = null) {
      // A suspended body hangs BELOW the cursor; a standing body extends above
      // its feet. Change the force direction, never flip the current angle on
      // release: the existing angle and velocity must settle continuously.
      last = inertia.step(dt, enabled, grabbed ? -1 : 1);
      sway.rotation.z = last.tilt;
      turn.rotation.y = springStep(yaw, facing ?? (motion.mode === 'walk' ? motion.direction * 1.08 : 0), dt, 75, 17, 1.3);
      root.updateWorldMatrix(true, true);
      for (const s of strands) {
        s.pose.copy(s.bone.quaternion);
        const weight = s.depth === 0 ? .48 : .27 / (1 + s.depth * .32);
        const angle = springStep(s.state, last.hair * weight, dt, Math.max(28, 70 - s.depth * 7), 9, .22);
        s.bone.parent.getWorldQuaternion(parentRotation).invert();
        axis.set(0, 0, 1).applyQuaternion(parentRotation).normalize();
        offset.setFromAxisAngle(axis, angle);
        s.bone.quaternion.premultiply(offset);
        s.bone.updateWorldMatrix(false, false);
      }
      applied = true;
      return { ...last, hairBones: strands.length, yaw: yaw.value };
    },
    diagnostics: () => ({ ...last, hairBones: strands.length, yaw: yaw.value }),
    dispose() { restore(); inertia.reset(); }
  };
}
