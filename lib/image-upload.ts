export async function imageData(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 2 * 1024 * 1024) throw new Error('The image must be smaller than 2 MB.');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

// Design artwork can be larger than receipt evidence. Normalize it before storing.
export async function designImageData(file: File, maxEdge?: number) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose an image smaller than 15 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This image could not be opened. Try exporting it as JPG or PNG.'); }
  try {
    const byteLimit = maxEdge ? 300 * 1024 : 2 * 1024 * 1024;
    if (file.size <= byteLimit && (!maxEdge || Math.max(bitmap.width, bitmap.height) <= maxEdge)) return await imageData(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this image.');
    for (const edge of (maxEdge ? [maxEdge, Math.round(maxEdge * .75), Math.round(maxEdge * .5)] : [1800, 1400, 1000])) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .85));
      if (blob && blob.size <= byteLimit) return await imageData(new File([blob], 'design.webp', { type: blob.type }));
    }
    throw new Error('The image is too detailed to resize. Try a smaller export.');
  } finally { bitmap.close(); }
}
