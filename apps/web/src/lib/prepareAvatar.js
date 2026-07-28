/**
 * Center-crop any orientation to a square JPEG for sharp retina avatars.
 * Falls back to the original file if canvas/crop is unavailable.
 */
export async function prepareSquareAvatarFile(file, edge = 512) {
  if (!file || typeof createImageBitmap !== 'function') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    const scale = Math.max(edge / bitmap.width, edge / bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    ctx.drawImage(bitmap, (edge - drawW) / 2, (edge - drawH) / 2, drawW, drawH);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    });
    if (!blob) return file;

    const base = String(file.name || 'avatar').replace(/\.[^.]+$/, '') || 'avatar';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}
