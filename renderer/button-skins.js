// Render the original NGUI button base with its nine-slice borders. Only the
// base inclines (10 degrees in the source prefab); labels remain ordinary DOM.
const atlas = new Image();
atlas.src = new URL('../assets/ui/common-atlas.png', import.meta.url).href;
const skins = {
  blue: { color: '#7ddff7', pattern: [1126, 1620, 251, 140] },
  white: { color: '#f6f7f8', pattern: [874, 1620, 251, 140] },
  gold: { color: '#f8ec48', pattern: [360, 1409, 251, 140] }
};
function base(ctx, width, height) {
  const sx = [1400, 1430, 1438, 1468], sy = [375, 405, 410, 445];
  const edge = Math.min(9, height / 3), dx = [0, edge, width - edge, width], dy = [0, edge, height - edge, height];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++)
    ctx.drawImage(atlas, sx[x], sy[y], sx[x+1]-sx[x], sy[y+1]-sy[y], dx[x], dy[y], dx[x+1]-dx[x], dy[y+1]-dy[y]);
}
function paint(button, canvas) {
  const width = button.clientWidth, height = button.clientHeight;
  if (!width || !height || !atlas.complete || !atlas.naturalWidth) return;
  const dpr = Math.min(3, devicePixelRatio || 1), w = Math.ceil(width * dpr), h = Math.ceil(height * dpr);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), silhouette = document.createElement('canvas');
  silhouette.width = w; silhouette.height = h;
  const shape = silhouette.getContext('2d'), inset = 2, bh = height - inset * 2;
  const tilt = Math.tan(Math.PI / 18), lean = bh * tilt;
  shape.scale(dpr, dpr);shape.translate(inset + lean, inset);shape.transform(1, 0, -tilt, 1, 0, 0);
  base(shape, width - inset * 2 - lean, bh);
  const skin = skins[button.classList.contains('btn-skin-gold') ? 'gold' : button.classList.contains('btn-skin-blue') ? 'blue' : 'white'];
  ctx.drawImage(silhouette, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';ctx.fillStyle = skin.color;ctx.fillRect(0, 0, w, h);
  ctx.save();ctx.scale(dpr, dpr);ctx.globalAlpha = skin === skins.white ? .16 : .55;
  const pw = bh * skin.pattern[2] / skin.pattern[3];
  ctx.drawImage(atlas, ...skin.pattern, inset, inset, pw, bh);
  ctx.translate(width, height);ctx.rotate(Math.PI);
  ctx.drawImage(atlas, ...skin.pattern, inset, inset, pw, bh);ctx.restore();
  button.dataset.skinReady = 'true';
}
export function installButtonSkins(root = document) {
  const canvases = new Map();
  const selector = 'button:is(.btn-skin-blue,.btn-skin-white,.btn-skin-gold)';
  const resize = new ResizeObserver(entries => { for (const {target} of entries) paint(target, canvases.get(target)); });
  function refresh() {
    for (const [button, canvas] of canvases) {
      if (!button.isConnected) { resize.unobserve(button);canvases.delete(button); }
      else if (canvas.parentElement !== button) button.prepend(canvas);
    }
    for (const button of root.querySelectorAll(selector)) if (!canvases.has(button)) {
      const canvas = document.createElement('canvas');canvas.className = 'button-art';canvas.setAttribute('aria-hidden', 'true');
      button.prepend(canvas);canvases.set(button, canvas);resize.observe(button);paint(button, canvas);
    }
  }
  const redraw = () => { for (const [button, canvas] of canvases) paint(button, canvas); };
  const mutations = new MutationObserver(refresh);mutations.observe(root, {childList: true, subtree: true});
  atlas.addEventListener('load', redraw);window.addEventListener('resize', redraw);refresh();
  return () => { resize.disconnect();mutations.disconnect();atlas.removeEventListener('load', redraw);window.removeEventListener('resize', redraw); };
}
