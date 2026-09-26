import * as THREE from '../assets/vendor/three/three.module.min.js';

// Locally built props, not original game meshes. Kivo's public item records
// supply reference icons but its current model catalogue has no furniture.
export const FURNITURE = {
  sofa: { name: '桌面沙发', itemId: 937, animation: 'Aris_Original_Cafe_my_gamedevdept_01_sofa_01_01', seatHeight: .62, yaw: 1.25 },
  arcade: { name: '游戏机', itemId: 837, animation: 'Aris_Original_Cafe_my_event12_gamemachine_01', seatHeight: null, yaw: 1.05 }
};
export function createDesktopFurniture(kind) {
  const group = new THREE.Group(), materials = new Map();
  function box(size, position, color, rotation = 0) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshToonMaterial({ color }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materials.get(color));
    mesh.position.set(...position); mesh.rotation.x = rotation; group.add(mesh); return mesh;
  }
  if (kind === 'sofa') {
    for (const x of [-.82, .82]) for (const z of [-.35, .28]) box([.12, .18, .12], [x, .09, z], '#514052');
    box([2, .26, .92], [0, .31, 0], '#a94258');
    box([1.68, .18, .76], [0, .53, .06], '#da7185');
    box([2, .91, .18], [0, .85, -.43], '#b9506a');
    for (const x of [-.91, .91]) box([.23, .5, .92], [x, .66, 0], '#ce657c');
    for (const x of [-.42, .42]) box([.8, .55, .15], [x, .93, -.29], '#d96f85', -.08);
    box([.018, .025, .65], [0, .635, .06], '#a94258');
    group.rotation.y = -.32;
  } else if (kind === 'arcade') {
    box([.95, .12, .72], [0, .06, 0], '#253657');
    box([.86, .82, .65], [0, .48, -.01], '#526b93');
    box([1.02, .15, .88], [0, .94, .08], '#849bc0');
    box([.96, .82, .46], [0, 1.39, -.15], '#334765');
    box([.78, .53, .025], [0, 1.43, .091], '#15253e');
    box([.66, .41, .018], [0, 1.43, .112], '#71c6cd');
    box([1, .17, .53], [0, 1.89, -.15], '#da738f');
    box([.69, .075, .022], [0, 1.89, .125], '#f9dfad');
    box([.12, .17, .026], [-.16, 1.39, .132], '#f7df9b');
    box([.12, .17, .026], [.16, 1.39, .132], '#f793b1');
    box([.56, .028, .027], [0, 1.29, .135], '#f0f8e0');
    for (const x of [-.2, .2]) {
      box([.035, .12, .035], [x, 1.075, .27], '#344059');
      box([.085, .06, .085], [x, 1.16, .27], '#e97089');
      box([.055, .03, .055], [x + .11, 1.03, .33], '#f7d68d');
    }
    group.rotation.y = -1.05;
  }
  group.name = `Desktop_${kind}`;
  return { group, dispose() { group.traverse(node => node.geometry?.dispose()); materials.forEach(material => material.dispose()); group.removeFromParent(); } };
}
