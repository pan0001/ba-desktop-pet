// Rendering includes every strand. Interaction and support surfaces omit hair.
export const collisionMaterial = material => Boolean(material?.visible && !/hair/i.test(material.name || ''));

const vertexCache = new WeakMap();
export function referencedVertices(mesh, materialFilter = null) {
  const geometry = mesh.geometry, materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const key = materials.map(m => !materialFilter || materialFilter(m) ? '1' : '0').join('');
  let cache = vertexCache.get(geometry);
  if (!cache) { cache = new Map(); vertexCache.set(geometry, cache); }
  if (cache.has(key)) return cache.get(key);
  const indices = geometry.index, count = indices?.count ?? geometry.attributes.position?.count ?? 0;
  const first = geometry.drawRange.start, last = Math.min(count, first + geometry.drawRange.count);
  const groups = Array.isArray(mesh.material) ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
  const used = new Set();
  for (const group of groups) {
    if (materialFilter && !materialFilter(materials[group.materialIndex])) continue;
    const end = Math.min(last, group.start + group.count);
    for (let i = Math.max(first, group.start); i < end; i++) used.add(indices ? indices.getX(i) : i);
  }
  const result = [...used]; cache.set(key, result); return result;
}

export function isCollisionHit(hit) {
  const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
  return collisionMaterial(materials[hit.face?.materialIndex || 0]);
}
