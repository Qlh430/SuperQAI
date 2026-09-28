"use strict";

const assert = require("node:assert/strict");
const rules = require("../image-output-rules.js");

assert.deepEqual(rules.extractImages({
  data: [
    { local_url: "/output/local.png", url: "/output/remote.png", width: 1024, height: 768 },
    { url: "/output/remote-only.png" },
    { b64_json: "AAAA", width: 256, height: 256 },
    {},
  ],
  saved_images: [
    { url: "/output/saved.png", width: 512, height: 512 },
    { url: "/output/saved-2.png", width: 800, height: 600 },
  ],
}), [
  {
    src: "/output/local.png",
    savedUrl: "/output/local.png",
    width: 1024,
    height: 768,
  },
  {
    src: "/output/saved-2.png",
    savedUrl: "/output/saved-2.png",
    width: 800,
    height: 600,
  },
  {
    src: "data:image/png;base64,AAAA",
    savedUrl: "",
    width: 256,
    height: 256,
  },
]);

assert.deepEqual(rules.extractImages(null), []);
assert.deepEqual(rules.extractImages({ data: null }), []);

assert.equal(
  rules.getImagesDimensionText([
    { width: 1024, height: 768 },
    { width: 1024, height: 768 },
    { width: 800, height: 1200 },
  ]),
  "1024\u00d7768\u3001800\u00d71200",
);
assert.deepEqual(rules.parseOutputPixelSize("1024X768"), { width: 1024, height: 768 });
assert.equal(rules.parseOutputPixelSize("auto"), null);

assert.equal(
  rules.getImageSizeNote("1024x768", [{ width: 1024, height: 768 }]),
  "\u5b9e\u9645\u5c3a\u5bf8\uff1a1024\u00d7768",
);
assert.equal(
  rules.getImageSizeNote("1024x768", [{ width: 800, height: 600 }]),
  "\u8bf7\u6c42\u5c3a\u5bf8\uff1a1024\u00d7768\uff0c\u5b9e\u9645\u8fd4\u56de\uff1a800\u00d7600",
);
assert.equal(
  rules.getImageSizeNote("auto", [{ width: 800, height: 600 }]),
  "\u5b9e\u9645\u5c3a\u5bf8\uff1a800\u00d7600",
);
assert.equal(rules.getImageSizeNote("1024x768", [{ width: 0, height: 0 }]), "");

assert.equal(rules.hasImageSizeMismatch("1024x768", [{ width: 800, height: 600 }]), true);
assert.equal(rules.hasImageSizeMismatch("1024x768", [{ width: 1024, height: 768 }]), false);
assert.equal(rules.hasImageSizeMismatch("auto", [{ width: 800, height: 600 }]), false);
assert.equal(rules.hasImageSizeMismatch("1024x768", [{ width: 0, height: 0 }]), false);

console.log("Image output rules checks passed.");
