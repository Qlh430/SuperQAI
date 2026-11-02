'use strict';

function bridgeRepresentationMethods(bridgeSource) {
  const methods = new Set();
  const call = /canvasRepresentation\?\.([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of bridgeSource.matchAll(call)) methods.add(match[1]);
  return [...methods].sort();
}

function missingCanvasRepresentationMethods(bridgeSource, hostSource) {
  const available = new Set();
  for (const method of bridgeRepresentationMethods(bridgeSource)) {
    const declaration = new RegExp(`^\\s{4}${method}\\s*\\(`, 'm');
    if (declaration.test(hostSource)) continue;
    available.add(method);
  }
  return [...available].sort();
}

function assertCanvasRepresentationCompatible(bridgeSource, hostSource, label = 'runtime') {
  const missing = missingCanvasRepresentationMethods(bridgeSource, hostSource);
  if (missing.length) {
    throw new Error(`${label}: CanvasRepresentationHost 缺少 bridge 调用的方法：${missing.join(', ')}`);
  }
}

module.exports = {
  bridgeRepresentationMethods,
  missingCanvasRepresentationMethods,
  assertCanvasRepresentationCompatible,
};
