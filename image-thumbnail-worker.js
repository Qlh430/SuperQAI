self.onmessage = async (event) => {
  const {
    id,
    source,
    maxSide = 640,
    quality = 0.76,
  } = event.data || {};
  try {
    const response = await fetch(source, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    const height = bitmap.height;
    if (Math.max(width, height) <= maxSide && blob.size <= 1024 * 1024) {
      bitmap.close();
      self.postMessage({ id, source, width, height, bytes: blob.size, lightweight: true });
      return;
    }

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const context = canvas.getContext("2d", { alpha: true });
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();
    const thumbnail = await canvas.convertToBlob({ type: "image/webp", quality });
    self.postMessage({ id, source, width, height, bytes: blob.size, lightweight: false, thumbnail });
  } catch (error) {
    self.postMessage({ id, source, error: error?.message || String(error) });
  }
};
