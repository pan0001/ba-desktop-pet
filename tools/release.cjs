const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { build, Platform, Arch } = require('electron-builder');
const { releaseDirectory, writeChecksums } = require('./release-checksums.cjs');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const metadata = require(path.join(root, 'package.json'));
const output = releaseDirectory();
const mac = process.platform === 'darwin';
const allowedTargets = new Set(mac ? ['dmg', 'zip', 'dir'] : ['nsis', 'portable', 'zip', 'dir']);
const fullAssets = process.argv.includes('--full-assets');
const requestedTargets = process.argv.slice(2).filter(arg => arg !== '--full-assets');
const resourceCatalog = require('../electron/resource-pack.cjs').validateCatalog(require('../assets/resource-catalog.json'));
const downloadable = new Set(Object.values(resourceCatalog.packs).flatMap(pack => pack.files.map(file => file.path)));
const targets = requestedTargets.length ? [...new Set(requestedTargets)] : mac ? ['dmg', 'zip'] : ['nsis', 'portable'];

function includeRuntimeFile(file) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (!fullAssets && (downloadable.has(relative) || /^assets\/media\/(?:models|imported-models)\/.*\.glb$/i.test(relative) || relative === 'assets/media/portraits')) return false;
  const name = path.basename(file);
  return name !== 'game-staging' && !/^readme(?:\.|$)/i.test(name) && !/\.md$/i.test(name) && name !== 'preview.html' &&
    !/\.map$/i.test(name) && !/^(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name);
}

function verifyRuntimeTree(directory) {
  let fileCount = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected link in release files: ${path.relative(directory, file)}`);
    if (entry.isDirectory()) {
      if (/^(?:node_modules|test-results|tests|\.git|\.tools)$/i.test(entry.name)) {
        throw new Error(`Development directory found in release: ${entry.name}`);
      }
      fileCount += verifyRuntimeTree(file);
    } else {
      fileCount++;
      if (/\.(?:json|js|cjs|mjs|html|css|md|txt|obj|mtl)$/i.test(entry.name)) {
        const text = fs.readFileSync(file, 'utf8');
        if (/[A-Z]:[\\/]+(?:Users|Documents and Settings)[\\/]|\/Users\/|\/home\/[A-Za-z0-9_-]+\//i.test(text)) {
          throw new Error(`Personal filesystem path found in release: ${path.relative(directory, file)}`);
        }
      }
    }
  }
  return fileCount;
}

async function main() {
  if (!(mac && ['x64','arm64'].includes(process.arch)) && !(process.platform === 'win32' && process.arch === 'x64')) throw new Error('Build on Windows x64 or macOS x64/arm64 using a native Node.js runtime.');
  if (targets.some(target => !allowedTargets.has(target))) throw new Error(`Supported targets on this OS: ${[...allowedTargets].join(', ')}.`);
  if (mac) {
    const electronArchitecture = execFileSync('lipo', ['-archs', require('electron')], { encoding: 'utf8' }).trim();
    const expectedArchitecture = process.arch === 'x64' ? 'x86_64' : 'arm64';
    if (electronArchitecture !== expectedArchitecture) throw new Error(`Electron architecture ${electronArchitecture} does not match Node.js ${process.arch}. Reinstall with npm_config_arch=${process.arch} npm ci before packaging.`);
  }
  const thirdPartyNotices = path.join(root, 'THIRD_PARTY_NOTICES.md');
  if (!fs.existsSync(thirdPartyNotices)) throw new Error('THIRD_PARTY_NOTICES.md must be present before building a release.');
  fs.mkdirSync(output, { recursive: true });
  const stage = fs.mkdtempSync(path.join(output, '.release-source-'));
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'build-native.cjs')], { cwd: root, stdio: 'inherit', windowsHide: true });
    for (const name of ['electron', 'renderer', 'scripts', 'assets']) {
      fs.cpSync(path.join(root, name), path.join(stage, name), { recursive: true, filter: includeRuntimeFile });
    }
    for (const name of ['pet.html', 'furniture.html', 'settings.html', 'THIRD_PARTY_NOTICES.md']) {
      fs.copyFileSync(path.join(root, name), path.join(stage, name));
    }
    const runtimeMetadata = Object.fromEntries(
      ['name', 'version', 'description', 'main', 'author', 'license', 'homepage', 'repository', 'dependencies'].filter(key => metadata[key] != null).map(key => [key, metadata[key]])
    );
    fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(runtimeMetadata, null, 2)}\n`, 'utf8');
    const count = verifyRuntimeTree(stage);
    if (!fs.existsSync(path.join(stage, 'assets', 'vendor', 'three', 'LICENSE'))) throw new Error('Three.js license is missing.');
    console.log(`Prepared ${count} runtime files; development dependencies, test profiles and private paths are excluded.`);

    // npm run pack retains its existing unpacked output. Release artifacts get
    // an independent app directory and output tree, leaving the running pet alone.
    await build({
      projectDir: root,
      targets: (mac ? Platform.MAC : Platform.WINDOWS).createTarget(targets, mac && process.arch === 'arm64' ? Arch.arm64 : Arch.x64),
      publish: 'never',
      config: {
        ...metadata.build,
        directories: { ...metadata.build.directories, app: stage, output },
        electronDist: path.join(root, 'node_modules', 'electron', 'dist'),
        electronVersion: require(path.join(root, 'node_modules', 'electron', 'package.json')).version,
        npmRebuild: false,
        nodeGypRebuild: false,
        compression: 'normal',
        // electron-builder treats .obj as compiler output by default. Kivo's
        // Wavefront halos need a separate asset matcher to retain those files.
        files: ['electron/**', 'renderer/**', 'scripts/**', 'assets/**', { from: 'assets', to: 'assets', filter: ['**/*.obj'] }, '*.html', 'package.json', 'THIRD_PARTY_NOTICES.md', 'node_modules/**'],
        afterPack: context => {
          const archive = path.join(context.packager.getResourcesDir(context.appOutDir), 'app.asar');
          const verify = directory => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
              const file = path.join(directory, entry.name);
              if (entry.isDirectory()) verify(file);
              else if (/\.obj$/i.test(entry.name)) {
                const relative = path.relative(stage, file);
                if (!asar.extractFile(archive, relative).equals(fs.readFileSync(file))) throw Error(`Packaged halo differs from source: ${relative}`);
              }
            }
          };
          verify(path.join(stage, 'assets'));
          const furniture = JSON.parse(fs.readFileSync(path.join(stage, 'assets/furniture/models.json')));
          for (const item of Object.values(furniture.items)) for (const file of [item.file, item.thumbnail]) {
            if (!fullAssets && downloadable.has(file)) continue;
            const relative = path.normalize(file);
            if (!asar.extractFile(archive, relative).equals(fs.readFileSync(path.join(stage, relative)))) throw Error(`Packaged furniture differs from source: ${file}`);
          }
        },
        // electron-builder concatenates the package.json array with API options.
        // Two matchers then copy/sign the same helper concurrently (EBUSY on
        // Windows). Clear the inherited array and install one matcher before
        // it computes the extra-resource copy plan.
        extraResources: null,
        beforePack: context => {
          context.packager.config.extraResources = [{ from: path.join(root, 'native', 'bin'), to: 'native', filter: [mac ? 'WindowGeometry' : 'WindowGeometry.exe'] }];
        },
        mac: { ...metadata.build.mac, target: targets.map(target => ({ target, arch: [process.arch] })) },
        win: {
          ...metadata.build.win,
          target: targets.map(target => ({ target, arch: ['x64'] })),
          artifactName: 'BA-Desktop-Pet-${version}-Windows-${arch}.${ext}',
          requestedExecutionLevel: 'asInvoker',
          signAndEditExecutable: true
        }
      }
    });
    if (targets.every(target => target === 'dir')) { console.log(`Unpacked app ready in ${output}`); return; }
    const { file, names } = await writeChecksums(output);
    console.log(`Built release files in ${path.relative(root, output)}:`);
    for (const name of names) console.log(`  ${name}`);
    console.log(`  ${path.basename(file)}`);
  } finally {
    // Delete only the unique staging folder created by this invocation.
    const resolvedStage = path.resolve(stage);
    if (path.dirname(resolvedStage) !== output || !path.basename(resolvedStage).startsWith('.release-source-')) {
      throw new Error('Refusing to remove an unexpected staging path.');
    }
    fs.rmSync(resolvedStage, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
