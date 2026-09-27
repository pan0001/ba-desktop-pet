const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));

function releaseDirectory() {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid release version.');
  return path.join(root, 'dist', 'releases', `v${version}`);
}

async function writeChecksums(directory = releaseDirectory()) {
  const prefix = `BA-Desktop-Pet-${version}-`;
  const names = fs.readdirSync(directory).filter(name =>
    ['latest.yml','beta.yml'].includes(name) || name.startsWith(prefix) && /(?:Setup-x64\.exe(?:\.blockmap)?|Portable-x64\.exe|Windows-x64\.zip|macOS-(?:x64|arm64)\.(?:dmg|zip))$/.test(name)
  ).sort();
  if (!names.length) throw new Error('No release artifacts found.');
  const lines = [];
  for (const name of names) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(path.join(directory, name))) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${name}`);
  }
  const file = path.join(directory, 'SHA256SUMS.txt');
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return { file, names };
}

module.exports = { releaseDirectory, writeChecksums };

if (require.main === module) {
  writeChecksums().then(({ file, names }) => {
    console.log(`SHA256 checksums written for ${names.length} artifact(s): ${path.relative(root, file)}`);
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
