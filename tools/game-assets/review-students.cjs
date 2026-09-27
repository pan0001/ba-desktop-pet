// Capture the live packaged desktop viewer; no QA camera, lights or materials.
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/student-review/actual');
const only = process.argv[2]?.split(',');
const catalogue = require('../../assets/characters.json').filter(c => !only || only.includes(c.id));
const version = require('../../package.json').version;
const executablePath = path.resolve(process.env.BA_REVIEW_EXE || path.join(root, `dist/releases/v${version}/win-unpacked/BA-Desktop-Pet.exe`));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const archiveHash = digest(fs.readFileSync(path.join(path.dirname(executablePath), 'resources/app.asar')));
const reviewHash = digest(fs.readFileSync(__filename));
for (const name of ['cards', 'records', 'frames']) fs.mkdirSync(path.join(output, name), { recursive: true });
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(output, `profile-${Date.now()}`) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: ['--test-mode', '--measure-pet'], env });
  try {
    const page = await app.firstWindow();
    let errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' || /Independent halo unavailable|Mouth expression unavailable/.test(message.text())) errors.push(message.text()); });
    await page.waitForSelector('#stage[data-state="ready"]', { timeout: 60000 });
    await app.evaluate(({ app, BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) { window.setOpacity(0); window.setFocusable(false); }
      process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -10000, y: -10000 });
    });
    await page.evaluate(() => window.pet.update({ size: 360, paused: true, roaming: false, windowWalking: false, physics: true,
      furniture: 'none', voiceEnabled: false, effectsEnabled: false, proactiveEvents: false }));
    const act = (action, value) => page.evaluate(({ action, value }) => window.petCompanionTest.review(action, value), { action, value });
    const advance = async milliseconds => { await act('pause', false); await page.waitForTimeout(milliseconds); await act('pause', true); };
    let done = 0;
    for (const character of catalogue) {
      const recordFile = path.join(output, 'records', character.id + '.json');
      const sha256 = digest(fs.readFileSync(path.join(root, character.file)));
      if (fs.existsSync(recordFile)) {
        const cached = JSON.parse(fs.readFileSync(recordFile));
        if (cached.archiveHash === archiveHash && cached.reviewHash === reviewHash && cached.sha256 === sha256 && !cached.errors.length) { console.log(`${++done}/${catalogue.length} ${character.id}: cached actual app`); continue; }
      }
      errors = [];
      await page.evaluate(id => window.pet.update({ characterId: id, paused: true }), character.id);
      await page.waitForSelector(`#stage[data-character="${character.id}"][data-state="ready"]`, { timeout: 60000 });
      // Remove the transient instruction tooltip from the contact sheet only.
      await page.evaluate(() => { document.querySelector('#notice').hidden = true; });
      await act('rest'); await advance(350);
      const shots = [];
      const capture = async (kind, label) => {
        const data = await page.evaluate(() => ({ diagnostics: window.petCompanionTest.review('inspect'), frame: window.petFrames?.at(-1),
          viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } }));
        const bytes = await page.screenshot({ omitBackground: true });
        fs.writeFileSync(path.join(output, 'frames', `${character.id}-${kind}.png`), bytes);
        const bounds = data.frame?.visibleBounds;
        if (!bounds || !Object.values(bounds).every(Number.isFinite)) errors.push(`${kind}: invalid actual frame bounds`);
        else if (bounds.left < -1 || bounds.top < -1 || bounds.right > data.viewport.width + 1 || bounds.bottom > data.viewport.height + 1) errors.push(`${kind}: clipped at actual viewport`);
        shots.push({ kind, label, ...data, png: bytes.toString('base64') });
      };
      await capture('idle', '待机');
      await act('motion', { mode: 'walk', direction: 1, vx: 45 }); await advance(650); await capture('walk', '行走');
      await act('rest'); await act('hold'); await advance(650); await capture('held', '抱起');
      await act('rest');
      const reaction = { id: `review-${character.id}`, outcome: 'help' };
      await act('motion', { mode: 'idle', reaction }); await act('pause', false);
      await page.waitForFunction(() => ['help', 'idle'].includes(window.petCompanionTest.viewer().mode), null, { timeout: 5000 }).catch(() => errors.push('landing: did not settle within 5s'));
      await act('pause', true); await capture('down', '倒地 / 等待');
      await act('motion', { mode: 'idle', reaction: { ...reaction, phase: 'rise' } }); await advance(850); await capture('rise', '起身');
      const card = await page.evaluate(async ({ shots, character }) => {
        const width = 250, height = 310, card = document.createElement('canvas'); card.width = width * 6; card.height = height + 62;
        const ctx = card.getContext('2d'); ctx.fillStyle = '#edf1f7'; ctx.fillRect(0, 0, card.width, card.height);
        ctx.fillStyle = '#111'; ctx.font = 'bold 18px Microsoft YaHei'; ctx.fillText(`${character.id} · ${character.name} · 实际打包程序 / 尺寸 360`, 10, 23);
        const samples = [shots[0], { ...shots[0], face: true, label: '眼睛 / 刘海（同帧裁切）' }, ...shots.slice(1)];
        for (const [index, shot] of samples.entries()) {
          const image = new Image(); image.src = 'data:image/png;base64,' + shot.png; await image.decode();
          const scale = image.width / shot.viewport.width, b = shot.frame.visibleBounds, head = shot.frame.headPoint;
          let x = b.left - 12, y = b.top - 12, w = b.right - b.left + 24, h = b.bottom - b.top + 24;
          if (shot.face && head) { w = h = Math.max(80, (b.bottom - b.top) * .5); x = head.x - w / 2; y = head.y - h * .6; }
          const factor = Math.min(width / w, height / h), dw = w * factor, dh = h * factor;
          ctx.drawImage(image, x * scale, y * scale, w * scale, h * scale, index * width + (width - dw) / 2, 30 + (height - dh) / 2, dw, dh);
          ctx.fillStyle = '#111'; ctx.font = '14px Microsoft YaHei'; ctx.fillText(shot.label, index * width + 7, height + 48);
        }
        return card.toDataURL('image/png');
      }, { shots, character });
      fs.writeFileSync(path.join(output, 'cards', character.id + '.png'), Buffer.from(card.split(',')[1], 'base64'));
      const state = await page.evaluate(() => window.pet.getState());
      fs.writeFileSync(recordFile, JSON.stringify({ id: character.id, name: character.name, source: 'packaged-live-pet-window', version, archiveHash, reviewHash, sha256,
        settings: Object.fromEntries(['size','canvasScale','physics','paused','furniture'].map(key => [key, state[key]])), errors,
        samples: shots.map(({ png, ...sample }) => sample) }, null, 2));
      console.log(`${++done}/${catalogue.length} ${character.id}: ${errors.length ? JSON.stringify(errors) : 'actual app captured'}`);
    }
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
