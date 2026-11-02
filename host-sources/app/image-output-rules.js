(function initImageOutputRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ImageOutputRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createImageOutputRules() {
  function extractImages(data) {
    const items = Array.isArray(data?.data) ? data.data : [];
    return items
      .map((item, index) => {
        const saved = data?.saved_images?.[index] || {};
        return {
          src: item.local_url || saved.url || item.url
            || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ""),
          savedUrl: item.local_url || saved.url || item.url || "",
          width: Number(item.width || saved.width || 0),
          height: Number(item.height || saved.height || 0),
        };
      })
      .filter((item) => item.src);
  }

  function getImagesDimensionText(images) {
    const sizes = (Array.isArray(images) ? images : [])
      .map((image) => Number(image?.width) && Number(image?.height)
        ? `${Number(image.width)}\u00d7${Number(image.height)}`
        : "")
      .filter(Boolean);
    return [...new Set(sizes)].join("\u3001");
  }

  function parseOutputPixelSize(value) {
    const match = String(value || "").trim().toLowerCase().match(/^(\d{2,5})x(\d{2,5})$/);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  function getImageSizeNote(requestedSize, images) {
    const actualText = getImagesDimensionText(images);
    if (!actualText) return "";
    const requested = parseOutputPixelSize(requestedSize);
    if (!requested) return `\u5b9e\u9645\u5c3a\u5bf8\uff1a${actualText}`;
    const requestedText = `${requested.width}\u00d7${requested.height}`;
    return actualText === requestedText
      ? `\u5b9e\u9645\u5c3a\u5bf8\uff1a${actualText}`
      : `\u8bf7\u6c42\u5c3a\u5bf8\uff1a${requestedText}\uff0c\u5b9e\u9645\u8fd4\u56de\uff1a${actualText}`;
  }

  function hasImageSizeMismatch(requestedSize, images) {
    const requested = parseOutputPixelSize(requestedSize);
    if (!requested) return false;
    return (Array.isArray(images) ? images : []).some((image) => {
      const width = Number(image?.width);
      const height = Number(image?.height);
      return width && height && (width !== requested.width || height !== requested.height);
    });
  }

  return Object.freeze({
    extractImages,
    getImagesDimensionText,
    parseOutputPixelSize,
    getImageSizeNote,
    hasImageSizeMismatch,
  });
});
