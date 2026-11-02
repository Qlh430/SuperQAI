'use strict';
const path = require('node:path');
const { records } = require('./portable-baseline.cjs');

function validateOverlayBase(candidate, reviewedFiles, desktopSource, appPath, pinnedAssets = []) {
  const actual = records(candidate);
  const canonical = files => JSON.stringify(files.slice().sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (canonical(actual) !== canonical(reviewedFiles)) throw Error('Reviewed base inventory mismatch');
  const prefix = appPath + '/desktop/';
  const packaged = actual.filter(file => file.path.startsWith(prefix)).map(file => ({ ...file, path: file.path.slice(prefix.length) }));
  const source = [...records(desktopSource), ...pinnedAssets];
  if (canonical(packaged) !== canonical(source)) throw Error('Current desktop source differs from reviewed base; refuse stale updater overlay');
  return { inventoryMatched: true, desktopSourceMatched: true, desktopFiles: source };
}
module.exports = { validateOverlayBase };
