// Guided native Windows input verification. Start this, use the actual mouse,
// then create test-results/finish-native to end the session and save observations.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const done = path.join(out, 'finish-native');
const delay = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (fs.existsSync(done)) fs.unlinkSync(done);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode', '--measure-pet'], env });
  const page = await app.firstWindow();
  await page.waitForSelector('#stage[data-state="ready"]');
  await page.evaluate(() => window.pet.update({ roaming: false, paused: false, physics: true, characterId: '212' }));
  await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
  await page.evaluate(() => {
    window.nativeEvents = [];
    for (const event of ['pointerdown', 'pointerup', 'pointercancel']) document.querySelector('#stage').addEventListener(event, e => window.nativeEvents.push({ event, x: e.clientX, y: e.clientY }));
    window.pet.onDrag(value => window.nativeEvents.push({ drag: value }));
  });
  await app.evaluate(({ app, BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows()[0], area = screen.getPrimaryDisplay().workArea, bounds = w.getBounds();
    process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testPlace({ ...bounds,
      x: area.x + Math.round((area.width - bounds.width) / 2), y: area.y + Math.round((area.height - bounds.height) / 2) });
  });
  const initial = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  console.log('Native test ready', initial);
  while (!fs.existsSync(done)) {
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'BA桌宠').getBounds());
    const observation = await page.evaluate(async () => ({ events: window.nativeEvents, frames: window.petFrames, animation: document.querySelector('#stage').dataset.animation, physics: { tilt: document.querySelector('#stage').dataset.tilt, hair: document.querySelector('#stage').dataset.hair }, state: await window.pet.getState() }));
    delete observation.state.characters;
    fs.writeFileSync(path.join(out, 'native-observation.json'), JSON.stringify({ initial, bounds, ...observation }, null, 2));
    await page.screenshot({ path: path.join(out, 'native-pet.png'), omitBackground: true });
    await delay(600);
  }
  await app.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
