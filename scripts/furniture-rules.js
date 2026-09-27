// Only repeatable authored clips are offered as desktop interactions.
export function furnitureInteraction(item, characterId) {
  if (item?.disabledInteractions?.[characterId] || item?.missingAnimations?.length) return null;
  const names = item?.candidates?.[characterId] || [];
  return names.find(n => /(?:_Idle|_Ing)(?:_\d+)?$/i.test(n)) || names.find(n => !/_(Start|End)$/i.test(n)) || null;
}

export function furnitureClipName(item, characterAnimation) {
  const clips = item.animations || [];
  if (!characterAnimation) return clips.find(n => /_Idle$/i.test(n)) || clips[0] || null;
  const start = characterAnimation.toLowerCase().indexOf(item.prefab.toLowerCase());
  const actor = (start < 0 ? '' : characterAnimation.slice(0, start)).replace(/_(?:Cafe|Coffee)_?$/i, '').replace(/_$/, '');
  const suffix = start < 0 ? '' : characterAnimation.slice(start + item.prefab.length);
  const expected = `${item.prefab}_${actor}${suffix}`.toLowerCase();
  const shared = clips.filter(n => actor && n.toLowerCase().includes(actor.toLowerCase()));
  return clips.find(n => n.toLowerCase() === expected)
    || shared.find(n => suffix && n.toLowerCase().endsWith(suffix.toLowerCase()))
    || (/_Idle$/i.test(suffix) && clips.find(n => n.toLowerCase() === `${item.prefab}_01_Idle`.toLowerCase()))
    || clips.find(n => n.toLowerCase() === (item.prefab + suffix).toLowerCase())
    || shared.find(n => n.toLowerCase() === `${item.prefab}_${actor}`.toLowerCase())
    || shared.find(n => !/_Idle$/i.test(n))
    || clips.find(n => /_Idle$/i.test(n)) || clips[0] || null;
}
