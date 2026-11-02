'use strict';

// Rebuild a release candidate from an already reviewed portable candidate while
// promoting one explicitly identified current build artifact. This keeps the
// reviewed candidate immutable and leaves a machine-readable provenance trail.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { records, componentRecords, zipFiles } = require('./portable-baseline.cjs');
const { validateOverlayBase } = require('./portable-overlay-validation.cjs');

const root = path.resolve(__dirname, '..');
const scope = path.join(root, '.planning', 'v3.0.1-today-20261019');
const baseName = process.argv[2] || 'release-3.0.1-last3';
const suffix = process.argv[3];
if (!/^release-3\.0\.1-[a-z0-9]+$/.test(baseName) || !/^-[a-z0-9]+$/.test(suffix || '')) throw Error('Explicit safe output suffix and reviewed release name required');
const baseRelease = path.join(scope, baseName);
const baseCandidate = path.join(scope, baseName.replace(/^release-/, 'candidate-'));
const outputCandidate = path.join(scope, `candidate-3.0.1${suffix}`);
const outputRelease = path.join(scope, `release-3.0.1${suffix}`);
const sourceArtifact = path.join(root, 'neon-workbench', 'dist', 'workbench.js');
const targetRelative = '.ai-runtime/versions/3.0.1-win-x64/resources/app/neon-workbench.js';
const targetArtifact = path.join(baseCandidate, ...targetRelative.split('/'));

function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
function same(a, b) { return a.size === b.size && a.sha256 === b.sha256; }
function index(list) { return new Map(list.map(item => [item.path, item])); }
function copyTree(source, target) {
  for (const file of records(source)) {
    const from = path.join(source, ...file.path.split('/'));
    const to = path.join(target, ...file.path.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    if (sha(to) !== file.sha256 || fs.statSync(to).size !== file.size) throw new Error('Tree copy integrity failed: ' + file.path);
  }
}

if (!fs.existsSync(baseCandidate) || !fs.existsSync(baseRelease)) throw new Error('Reviewed base candidate/release missing');
if (!fs.existsSync(sourceArtifact)) throw new Error('Current build artifact missing: ' + sourceArtifact);

const baseFiles = JSON.parse(fs.readFileSync(path.join(baseRelease, 'portable-files.json'), 'utf8')).files;
const ownership = JSON.parse(fs.readFileSync(path.join(root, 'release-tools/ownership.json'), 'utf8'));
const icon = ownership.files.find(file => file.path === 'desktop/icon.ico');
if (!icon || icon.origin !== 'pinned-external-artifact') throw Error('Reviewed desktop icon ownership missing');
const baseValidation = validateOverlayBase(baseCandidate, baseFiles, path.join(root, 'host-sources/app/desktop'), '.ai-runtime/versions/3.0.1-win-x64/resources/app', [{ path:'icon.ico', size:icon.size, sha256:icon.sha256 }]);
const sourceHash = sha(sourceArtifact);
const sourceSize = fs.statSync(sourceArtifact).size;
const beforeHash = sha(targetArtifact);
const beforeSize = fs.statSync(targetArtifact).size;

if (fs.existsSync(outputCandidate) || fs.existsSync(outputRelease)) throw Error('Refusing to overwrite an existing candidate or release');
fs.mkdirSync(outputCandidate, { recursive: false });
copyTree(baseCandidate, outputCandidate);
fs.mkdirSync(outputRelease, { recursive: true });
const target = path.join(outputCandidate, ...targetRelative.split('/'));
fs.copyFileSync(sourceArtifact, target);
if (sha(target) !== sourceHash || fs.statSync(target).size !== sourceSize) throw new Error('Overlay write integrity failed');

const appRoot = path.join(outputCandidate, '.ai-runtime', 'versions', '3.0.1-win-x64', 'resources', 'app');
const runtimeRoot = path.join(outputCandidate, '.ai-runtime', 'versions', '3.0.1-win-x64');
const appFiles = records(appRoot).filter(file => file.path !== 'ai-os-components.json');
const components = componentRecords(appFiles, '3.0.1');
for (const component of components) {
  const fileName = `AI-OS-Component-3.0.1-${component.id}.zip`;
  const asset = path.join(outputRelease, fileName);
  zipFiles(appRoot, component.files, asset, component.id);
  component.asset = { fileName, size: fs.statSync(asset).size, sha256: sha(asset) };
}

const previousManifest = JSON.parse(fs.readFileSync(path.join(baseRelease, 'ai-os-components.json'), 'utf8'));
const manifest = {
  ...previousManifest,
  version: '3.0.1',
  runtime: '3.0.1-win-x64',
  runtimeFiles: records(runtimeRoot).filter(file => file.path !== 'resources/app/ai-os-components.json'),
  components,
  authentication: { status: 'pending-authorized-signing', trusted: false },
  protocolEvolution: 'Ship updater bridge under format 1 before introducing a higher manifest format; old clients must reject unknown formats.'
};
fs.writeFileSync(path.join(appRoot, 'ai-os-components.json'), JSON.stringify(manifest, null, 2) + '\n');
writeJson(path.join(outputRelease, 'ai-os-components.json'), manifest);

const gate = require('./css-source-preflight.cjs').assess(root);
writeJson(path.join(outputRelease, 'production-source-gate.json'), gate);
const files = records(outputCandidate);
const treeHash = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
writeJson(path.join(outputRelease, 'portable-files.json'), { format: 1, product: 'AI OS', version: '3.0.1', treeHash, files });

const previousDerivationHash = sha(path.join(baseRelease, 'derivation.json'));
writeJson(path.join(outputRelease, 'derivation.json'), {
  version: '3.0.1',
  baseRelease: baseName,
  baseReleaseDerivationSha256: previousDerivationHash,
  baseValidation,
  sourceArtifact: {
    path: 'neon-workbench/dist/workbench.js',
    size: sourceSize,
    sha256: sourceHash,
    reason: 'Promote current npm run build output containing the approved management page update UI.'
  },
  changes: [{ path: targetRelative, before: { size: beforeSize, sha256: beforeHash }, after: { size: sourceSize, sha256: sourceHash } }],
  goldenChanged: false
});

const portableZip = path.join(outputRelease, 'AI-OS-v3.0.1-win-x64-Portable.zip');
zipFiles(outputCandidate, files, portableZip);
const runtimeZip = path.join(outputRelease, 'AI-OS-Runtime-3.0.1-win-x64.zip');
zipFiles(runtimeRoot, records(runtimeRoot), runtimeZip, '3.0.1-win-x64');
writeJson(path.join(outputRelease, 'ai-os-update.json'), {
  format: 1, product: 'AI OS', version: '3.0.1', platform: 'win32', arch: 'x64', minUpdaterVersion: 1,
  fileName: path.basename(runtimeZip), size: fs.statSync(runtimeZip).size, sha256: sha(runtimeZip),
  components: { fileName: 'ai-os-components.json', size: fs.statSync(path.join(outputRelease, 'ai-os-components.json')).size, sha256: sha(path.join(outputRelease, 'ai-os-components.json')) },
  authentication: { status: 'pending-authorized-signing', trusted: false }
});
const baseIndex = index(baseFiles);
const changed = files.filter(file => !same(file, baseIndex.get(file.path) || {}));
writeJson(path.join(outputRelease, 'overlay-diff.json'), { base: baseName, changed, sourceArtifact: { path: 'neon-workbench/dist/workbench.js', size: sourceSize, sha256: sourceHash } });
writeJson(path.join(outputRelease, 'release-files.json'), { version: '3.0.1', status: 'BLOCKED', reason: 'CSS provenance, publisher authentication and real client update gates remain open', files: records(outputRelease) });
console.log(JSON.stringify({ outputCandidate, outputRelease, files: files.length, changed: changed.map(file => file.path), treeHash, portableZip: path.basename(portableZip), portableSize: fs.statSync(portableZip).size, portableSha256: sha(portableZip), workbenchSha256: sourceHash }, null, 2));
