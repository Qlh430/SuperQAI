'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const P=require('./p0-integrity.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// These outputs are compiled or patched by deploy.mjs; its read-only
// --verify-components pass verifies their current production recipes.
const derived=new Set(['script.js','desktop-shell.js','desktop/startup.html','module-manifest.js','server-components/composition.js','server.js']);
const generated=new Set(['index.html','neon-workbench.html','package.json']);
const bundles={'neon-workbench.js':'workbench.js','neon-workbench.css':'neon-workbench.css','canvas-document-reader.js':'canvas-document-reader.js'};
function assess(root,app,resolveFile=relative=>path.join(app,relative)){
  const ownership=JSON.parse(fs.readFileSync(path.join(root,'release-tools/ownership.json'),'utf8'));
  const problems=[],files=[],declared=new Set();
  for(const file of ownership.files){
    for(const input of file.inputs)declared.add(input.path);
    const actual=resolveFile(file.path);
    try{
      const output=fs.readFileSync(actual);
      const kind=bundles[file.path]?'compiler-output':derived.has(file.path)?'deploy-recipe':generated.has(file.path)?'generated-entry':'exact-source';
      const source=bundles[file.path]?fs.readFileSync(path.join(root,'neon-workbench/dist',bundles[file.path])):kind==='exact-source'?P.render(root,file):null;
      if(source&&!source.equals(output))problems.push({path:file.path,reason:'current-source-mismatch'});
      files.push({path:file.path,kind,sha256:hash(output),inputs:file.inputs.map(input=>({path:input.path,sha256:P.hashFile(P.within(root,input.path))}))});
    }catch(error){problems.push({path:file.path,reason:error.message});}
  }
  for(const file of P.listTree(path.join(root,'host-sources/app'))){
    const relative='host-sources/app/'+file;
    if(!declared.has(relative))problems.push({path:relative,reason:'unreviewed-host-source'});
  }
  return{format:1,ok:!problems.length,scope:'current-source-not-historical-golden',derivedVerification:'deploy.mjs --verify-components',files,problems};
}
function fileRecords(root, files) {
  return [...new Set(files)].sort().map(relative => {
    const file = P.within(root, relative);
    return { path: relative, size: fs.statSync(file).size, sha256: P.hashFile(file) };
  });
}
function verifyRecords(root, records) {
  for (const record of records) {
    const file = P.within(root, record.path);
    if (fs.statSync(file).size !== record.size || P.hashFile(file) !== record.sha256) throw Error('Locked file changed: ' + record.path);
  }
}
function syncOwned(root, app) {
  P.isolated(root, app);
  const ownership = JSON.parse(fs.readFileSync(path.join(root, 'release-tools/ownership.json'), 'utf8'));
  for (const file of ownership.files) {
    if (['index.html', 'module-manifest.js', 'neon-workbench.html', 'package.json'].includes(file.path)) continue;
    const target = P.within(app, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, P.render(root, file));
  }
}
function assertCheckpoint(root, inputs, expectedCommit) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const commit = git(['rev-parse', 'HEAD']).trim();
  if (expectedCommit && expectedCommit !== commit) throw Error('Release checkpoint does not match actual HEAD');
  const tracked = new Set(git(['ls-tree', '-r', '--name-only', '-z', 'HEAD']).split('\0'));
  const dirty = new Set(git(['diff', '--name-only', '-z', 'HEAD']).split('\0'));
  const uncommitted = inputs.filter(file => !tracked.has(file) || dirty.has(file));
  const tree = new Map(git(['ls-tree', '-r', '-z', 'HEAD']).split('\0').filter(Boolean).map(record => {
    const tab = record.indexOf('\t');
    return [record.slice(tab + 1), record.slice(0, tab).split(' ')[2]];
  }));
  const committedInputs = inputs.filter(file => tracked.has(file));
  if (committedInputs.length) {
    const hashes = execFileSync('git', ['hash-object', '--stdin-paths'], { cwd: root, encoding: 'utf8', input: committedInputs.join('\n') + '\n', maxBuffer: 8 * 1024 * 1024 }).trim().split(/\r?\n/);
    committedInputs.forEach((file, index) => { if (hashes[index] !== tree.get(file) && !uncommitted.includes(file)) uncommitted.push(file); });
  }
  const watched = ['host-sources/app/', 'neon-workbench/src/', 'neon-workbench/design-sources/'];
  for (const file of [...dirty, ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')]) {
    if (watched.some(prefix => file.startsWith(prefix)) && !uncommitted.includes(file)) uncommitted.push(file);
  }
  if (uncommitted.length) throw Error('Uncommitted release inputs: ' + uncommitted.join(', '));
  return { commit, branch: git(['branch', '--show-current']).trim() };
}
async function development(root) {
  const workbench = path.join(root, 'neon-workbench');
  const { dailyPaths, frontendFiles, runningBackend } = await import(pathToFileURL(path.join(workbench, 'daily-workbench.mjs')));
  const { componentInputs, componentTargets, releaseComponents } = await import(pathToFileURL(path.join(workbench, 'component-deploy.mjs')));
  const paths = dailyPaths(workbench);
  const ownership = JSON.parse(fs.readFileSync(path.join(root, 'release-tools/ownership.json'), 'utf8'));
  const { runtimeName, programFiles } = require('../host-sources/app/desktop/update-files');
  const active = runtimeName(fs.readFileSync(path.join(paths.portable, '.ai-runtime/.active-runtime'), 'utf8').trim());
  const runtime = path.join(paths.portable, '.ai-runtime/versions', active);
  P.within(runtime, 'resources/app/package.json'); P.within(paths.runtime, 'package.json');
  const app = path.join(runtime, 'resources/app');
  const resolveFile = relative => path.join(frontendFiles.has(relative) ? paths.runtime : app, relative);
  const source = assess(root, app, resolveFile);
  const recipeChecks = ['frontend', 'runtime'].map(scope => {
    const result = JSON.parse(execFileSync(process.execPath, [path.join(workbench, 'deploy.mjs'), '--verify-development=' + scope], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
    // Cache markers are derived metadata, locked byte-for-byte separately below.
    return { scope, changed: result.changed.filter(file => !['index.html', 'module-manifest.js', 'neon-workbench.html'].includes(file)) };
  });
  const effectivePaths = [...new Set([...P.listTree(app), ...frontendFiles])].filter(file => file !== 'ai-os-components.json');
  const owned = new Set([...ownership.files.map(file => file.path), ...componentTargets(releaseComponents)]);
  for (const file of effectivePaths) {
    P.safeRelative(file);
    if (!owned.has(file)) throw Error('Unreviewed development output; establish ownership before releasing: ' + file);
  }
  const effective = effectivePaths.sort().map(file => ({ path: file, origin: frontendFiles.has(file) ? 'fixed-stage' : 'active-runtime', size: fs.statSync(resolveFile(file)).size, sha256: P.hashFile(resolveFile(file)) }));
  const inputPaths = new Set(ownership.files.flatMap(file => file.inputs.map(input => input.path)));
  for (const file of componentInputs()) inputPaths.add(path.relative(root, path.resolve(workbench, file)).replaceAll('\\', '/'));
  for (const directory of ['host-sources/app', 'neon-workbench/src', 'neon-workbench/design-sources']) {
    for (const file of P.listTree(path.join(root, directory))) inputPaths.add(directory + '/' + file);
  }
  for (const file of fs.readdirSync(workbench)) if (/\.(mjs|cjs|json|ts)$/.test(file)) inputPaths.add('neon-workbench/' + file);
  for (const file of fs.readdirSync(path.join(root, 'release-tools'))) if (/\.(cjs|cs|json|ps1)$/.test(file)) inputPaths.add('release-tools/' + file);
  const inputs = fileRecords(root, [...inputPaths]);
  let processState = '尚无法验证', processError = '', loadedDifferences = [], proxiedFrontend = [];
  try {
    const upstream = await runningBackend(workbench);
    const diagnostic = JSON.parse(fs.readFileSync(path.join(paths.portable, 'data/.logs/runtime-diagnostics.json'), 'utf8'));
    if (Array.isArray(diagnostic.loadedProgramFiles)) {
      const disk = programFiles(app), loaded = new Map(diagnostic.loadedProgramFiles.map(file => [file.path, file.sha256]));
      loadedDifferences = [...new Set([...disk.map(file => file.path), ...loaded.keys()])].filter(file => loaded.get(file) !== disk.find(record => record.path === file)?.sha256);
      processState = loadedDifferences.length ? '存在差异' : '一致且已验证';
    } else processError = '当前进程没有启动时程序指纹，不能仅凭磁盘文件认定进程已加载；需在更新诊断代码后正常重启确认。';
    for (const file of effective.filter(file => file.origin === 'fixed-stage')) {
      const response = await fetch('http://127.0.0.1:33200/' + file.path, { signal: AbortSignal.timeout(5000) });
      if (!response.ok || hash(Buffer.from(await response.arrayBuffer())) !== file.sha256) {
        loadedDifferences.push(file.path);
        processState = '存在差异';
      } else if (response.headers.get('x-ai-os-frontend') !== 'fixed-stage') {
        const backend = await fetch(upstream + '/' + file.path, { signal: AbortSignal.timeout(5000) });
        if (!backend.ok || hash(Buffer.from(await backend.arrayBuffer())) !== file.sha256 || P.hashFile(path.join(app, file.path)) !== file.sha256) throw Error('无法证明开发入口资源的实际来源：' + file.path);
        file.origin = 'active-runtime';
        proxiedFrontend.push(file.path);
      }
    }
  } catch (error) { processError = error.message; processState = loadedDifferences.length ? '存在差异' : '尚无法验证'; }
  const pending = [...source.problems, ...recipeChecks.flatMap(check => check.changed.map(file => ({ path: file, reason: check.scope + '-source-not-deployed' })))];
  return { format: 1, status: pending.length ? '存在差异' : processState, root, active, runtime, app, stage: paths.runtime, frontendCount: frontendFiles.size,
    processState, processError, loadedDifferences, proxiedFrontend, pending, effective, inputs,
    gitInputs: [...inputPaths].filter(file => !file.startsWith('release-tools/.cache/') && !file.startsWith('neon-workbench/dist/')),
    componentGroups: releaseComponents, componentTargets: componentTargets(releaseComponents) };
}
async function lockDevelopment(root, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid release version');
  const dev = await development(root);
  if (dev.status !== '一致且已验证') throw Error('Development baseline is not synchronized: ' + JSON.stringify({ pending: dev.pending, processState: dev.processState, processError: dev.processError }));
  const checkpoint = assertCheckpoint(root, dev.gitInputs, process.env.AI_OS_RELEASE_COMMIT);
  const nativeFiles = fileRecords(dev.runtime, P.listTree(dev.runtime).filter(file => !file.startsWith('resources/app/')));
  const lock = { ...dev, version, checkpoint, nativeFiles, launcher: fileRecords(path.dirname(path.dirname(path.dirname(dev.runtime))), ['BenDo.exe']), createdAt: new Date().toISOString() };
  const file = path.join(root, '.planning/release-' + version, 'source-lock.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
  return { file, version, checkpoint, effectiveFiles: dev.effective.length };
}
function verifyLock(root, lock) {
  if (lock.format !== 1 || lock.root !== path.resolve(root) || !lock.checkpoint?.commit || lock.status !== '一致且已验证') throw Error('Invalid release source lock');
  assertCheckpoint(root, lock.gitInputs, lock.checkpoint.commit);
  verifyRecords(root, lock.inputs);
  const nativePaths = P.listTree(lock.runtime).filter(file => !file.startsWith('resources/app/'));
  if (JSON.stringify(nativePaths) !== JSON.stringify(lock.nativeFiles.map(file => file.path))) throw Error('Locked native file set changed');
  verifyRecords(lock.runtime, lock.nativeFiles);
  const portable = path.dirname(path.dirname(path.dirname(lock.runtime)));
  verifyRecords(portable, lock.launcher);
  if (fs.readFileSync(path.join(portable, '.ai-runtime/.active-runtime'), 'utf8').trim() !== lock.active) throw Error('Active development runtime changed since lock');
  for (const file of lock.effective) verifyRecords(file.origin === 'fixed-stage' ? lock.stage : lock.app, [file]);
}
function verifyEffective(app, lock) {
  const expected = new Map(lock.effective.map(file => [file.path, file]));
  const actual = P.listTree(app).filter(file => !['package.json', 'ai-os-components.json'].includes(file));
  const problems = [];
  for (const relative of new Set([...actual, ...expected.keys()])) {
    if (relative === 'package.json') continue;
    const file = expected.get(relative);
    if (!file || !fs.existsSync(path.join(app, relative)) || P.hashFile(path.join(app, relative)) !== file.sha256) problems.push(relative);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
  const original = JSON.parse(fs.readFileSync(path.join(lock.app, 'package.json'), 'utf8'));
  delete pkg.version; delete original.version;
  if (JSON.stringify(pkg) !== JSON.stringify(original)) problems.push('package.json (non-version fields)');
  if (problems.length) throw Error('Release differs from locked development resources: ' + problems.join(', '));
}
function verifyRelease(root, directory, remote = false) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-files.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'release-source-lock.json'), 'utf8'));
  if (manifest.version !== lock.version || manifest.sourceCommit !== lock.checkpoint.commit) throw Error('Release source checkpoint mismatch');
  verifyRecords(directory, manifest.files);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const tag = 'v' + manifest.version;
  if (git(['rev-parse', tag + '^{commit}']) !== manifest.sourceCommit) throw Error('Release tag points to another source checkpoint');
  if (!remote) return { status: '一致且已验证', tag, commit: manifest.sourceCommit, assets: manifest.files.length, remote: '尚无法验证' };
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', 'repos/Qlh430/SuperQAI/' + endpoint], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  const release = api('releases/tags/' + tag);
  let ref = api('git/ref/tags/' + tag).object;
  for (let depth = 0; ref.type === 'tag' && depth < 5; depth++) ref = api('git/tags/' + ref.sha).object;
  if (ref.type !== 'commit' || ref.sha !== manifest.sourceCommit || release.draft || release.prerelease) throw Error('GitHub release/tag checkpoint mismatch');
  const expected = [...manifest.files, ...fileRecords(directory, ['release-files.json'])];
  if (release.assets.length !== expected.length) throw Error('GitHub release asset file set mismatch');
  for (const file of expected) {
    const asset = release.assets.find(asset => asset.name === file.path);
    if (!asset || asset.size !== file.size || asset.digest !== 'sha256:' + file.sha256) throw Error('GitHub asset hash missing or mismatched: ' + file.path);
  }
  return { status: '一致且已验证', tag, commit: manifest.sourceCommit, assets: expected.length, url: release.html_url, remote: '一致且已验证' };
}
module.exports={assess,fileRecords,verifyRecords,syncOwned,assertCheckpoint,development,lockDevelopment,verifyLock,verifyEffective,verifyRelease};
if (require.main === module) {
  const root = path.resolve(__dirname, '..'), [command, version, option] = process.argv.slice(2);
  (async () => {
    if (!['status', 'lock', 'verify-release'].includes(command)) throw Error('Usage: node release-tools/release-source-sync.cjs status | lock X.Y.Z | verify-release directory [--remote]');
    const result = command === 'verify-release' ? verifyRelease(root, path.resolve(version), option === '--remote') : command === 'lock' ? await lockDevelopment(root, version) : await development(root);
    if (command === 'status') {
      const { effective, inputs, gitInputs, componentTargets, ...summary } = result;
      console.log(JSON.stringify({ ...summary, effectiveFiles: effective.length, sourceInputs: inputs.length }, null, 2));
    } else console.log(JSON.stringify(result, null, 2));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
