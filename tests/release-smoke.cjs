// Static release verification: do not execute an installer or modify user data.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const release = path.resolve(process.argv[2] || path.join(root, `dist/releases/v${version}`));
const output = path.join(root, 'test-results');
const sevenZip = path.join(root, 'node_modules/electron-winstaller/vendor/7z-x64.exe');
const report = { passed: false, method: 'Read ASAR and inspect/extract embedded archives without executing NSIS or portable launchers', release, installersExecuted: false };
const checksum = file => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256'), stream = fs.createReadStream(file);
  stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(hash.digest('hex')));
});
function zip(args) {
  return execFileSync(sevenZip, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}
function archiveEntries(file) {
  const listing = zip(['l', '-slt', file]);
  const start = listing.indexOf('----------');
  assert.ok(start >= 0, 'Archive has a readable member listing');
  const entries = [...listing.slice(start).matchAll(/^Path = (.+)$/gm)].map(match => match[1].trim());
  for (const name of entries) {
    assert.ok(!path.win32.isAbsolute(name) && !name.split(/[\\/]/).includes('..'), `Unsafe archive member: ${name}`);
  }
  return entries;
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const stage = fs.mkdtempSync(path.join(output, '.release-smoke-'));
  try {
    const appDirectory = path.join(release, 'win-unpacked');
    const archive = path.join(appDirectory, 'resources/app.asar');
    const paths = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\/+/, ''));
    const files = paths.filter(name => !asar.statFile(archive, path.normalize(name)).files);
    const read = file => asar.extractFile(archive, path.normalize(file));
    const expectedFiles = ['package.json', 'electron/main.cjs', 'electron/preload.cjs', 'electron/care.cjs', 'renderer/pet.js', 'renderer/settings.js',
      'pet.html', 'settings.html', 'THIRD_PARTY_NOTICES.md', 'assets/characters.json', 'assets/voices/catalog.json',
      'assets/emotions/catalog.json', 'assets/ui/catalog.json', 'assets/vendor/three/LICENSE'];
    for (const file of expectedFiles) assert.ok(files.includes(file), `Runtime includes ${file}`);
    const metadata = JSON.parse(read('package.json'));
    assert.equal(metadata.version, version);
    assert.equal(metadata.devDependencies, undefined); assert.equal(metadata.scripts, undefined);
    const forbidden = files.filter(file => /(?:^|\/)(?:node_modules|test-results|tests|\.git|\.tools)(?:\/|$)|(?:^|\/)preview\.html$/i.test(file));
    assert.deepEqual(forbidden, [], 'Development files stay out of the distributed app');
    const privatePaths = [];
    for (const file of files.filter(file => /\.(?:json|js|cjs|mjs|html|css|md|txt|obj|mtl)$/i.test(file))) {
      if (/[A-Z]:[\\/]+(?:Users|Documents and Settings)[\\/]|\/Users\/|\/home\/[A-Za-z0-9_-]+\//i.test(read(file).toString('utf8'))) privatePaths.push(file);
    }
    assert.deepEqual(privatePaths, [], 'Runtime contains no private filesystem source paths');
    const characters = JSON.parse(read('assets/characters.json'));
    const voices = JSON.parse(read('assets/voices/catalog.json'));
    const emotions = JSON.parse(read('assets/emotions/catalog.json'));
    const ui = JSON.parse(read('assets/ui/catalog.json'));
    const references = [...characters.map(character => character.file), ...characters.map(character => character.portrait).filter(Boolean),
      ...voices.files.map(file => file.file), ...Object.values(emotions.icons).map(icon => icon.file), ...Object.values(ui.images).map(image => image.file)];
    for (const reference of references) assert.ok(files.includes(reference), `Runtime asset exists: ${reference}`);
    const critical = ['BA-Desktop-Pet.exe', 'resources/app.asar', 'resources/native/WindowGeometry.exe', 'LICENSE.electron.txt', 'LICENSES.chromium.html'];
    const expectedHashes = {};
    for (const file of critical) {
      const absolute = path.join(appDirectory, file); assert.ok(fs.statSync(absolute).size > 0, file);
      expectedHashes[file] = await checksum(absolute);
    }
    report.runtime = { version: metadata.version, files: files.length, models: characters.length, indexedVoiceAndFurnitureFiles: voices.files.length,
      emotions: Object.keys(emotions.icons).length, uiImages: Object.keys(ui.images).length, checkedReferences: references.length,
      privatePaths, forbidden, criticalFiles: expectedHashes };

    const sums = new Map(fs.readFileSync(path.join(release, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/).map(line => {
      const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/); assert.ok(match, 'Valid SHA256SUMS line'); return [match[2], match[1].toLowerCase()];
    }));
    report.packages = [];
    for (const kind of ['Setup', 'Portable']) {
      const name = `BA-Desktop-Pet-${version}-${kind}-x64.exe`, file = path.join(release, name);
      const digest = await checksum(file); assert.equal(digest, sums.get(name), `${kind} matches SHA256SUMS.txt`);
      const entries = archiveEntries(file);
      const embedded = entries.find(member => /(?:^|[\\/])app-64\.7z$/i.test(member));
      assert.ok(embedded, `${kind} contains the x64 application package`);
      const destination = path.join(stage, kind); fs.mkdirSync(destination);
      zip(['e', '-y', file, embedded, `-o${destination}`]);
      const payload = path.join(destination, 'app-64.7z');
      const payloadHash = await checksum(payload);
      report.packages.push({ name, bytes: fs.statSync(file).size, sha256: digest, embeddedMembers: entries.length, payloadSha256: payloadHash });
      if (kind === 'Setup') {
        const payloadEntries = archiveEntries(payload).map(member => member.replaceAll('\\', '/'));
        for (const member of critical) assert.ok(payloadEntries.includes(member), `Embedded app includes ${member}`);
        zip(['t', payload]);
        const extracted = path.join(stage, 'payload'); fs.mkdirSync(extracted);
        zip(['x', '-y', payload, ...critical.map(member => member.replaceAll('/', '\\')), `-o${extracted}`]);
        for (const member of critical) assert.equal(await checksum(path.join(extracted, member)), expectedHashes[member], `Packaged ${member} matches tested runtime`);
        report.embeddedPayload = { testedAllMembers: true, members: payloadEntries.length, criticalFilesMatchRuntime: true };
      } else assert.equal(payloadHash, report.packages[0].payloadSha256, 'Installer and portable embed the same tested application archive');
    }
    report.passed = true;
    console.log('Release smoke passed: ASAR, local resources, licenses, checksums, NSIS and portable embedded payloads. No installer was executed.');
  } finally {
    asar.uncacheAll();
    const resolved = path.resolve(stage);
    assert.equal(path.dirname(resolved), path.resolve(output));
    assert.ok(path.basename(resolved).startsWith('.release-smoke-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch(error => { report.error = error.stack || String(error); console.error(error); process.exitCode = 1; })
  .finally(() => fs.writeFileSync(path.join(output, 'release-smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`));
