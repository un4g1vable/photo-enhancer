// Резервное применение коррекции на CPU (если WebGL недоступен или изображение
// больше лимита текстур GPU). Работает по чанкам строк, между чанками уступает
// управление и сообщает прогресс; поддерживает отмену. Та же математика, что и
// в WebGL-варианте.

const tick = () => new Promise((r) => setTimeout(r, 0))
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

export async function applyWithCPU(bitmap, coeffs, onProgress = () => {}, isCancelled = () => false) {
  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)

  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  const b = coeffs.brightness
  const k = coeffs.contrast
  const s = coeffs.saturation
  const pivot = coeffs.meanLuma * coeffs.brightness * 255 // в шкале 0..255

  const ROWS = 128
  for (let y = 0; y < height; y += ROWS) {
    if (isCancelled()) throw new Error('TASK_ABORTED')
    const endY = Math.min(y + ROWS, height)
    for (let row = y; row < endY; row++) {
      let idx = row * width * 4
      for (let x = 0; x < width; x++, idx += 4) {
        let r = data[idx] * b
        let g = data[idx + 1] * b
        let bl = data[idx + 2] * b
        r = (r - pivot) * k + pivot
        g = (g - pivot) * k + pivot
        bl = (bl - pivot) * k + pivot
        const gray = 0.299 * r + 0.587 * g + 0.114 * bl
        data[idx] = clamp255(gray + (r - gray) * s)
        data[idx + 1] = clamp255(gray + (g - gray) * s)
        data[idx + 2] = clamp255(gray + (bl - gray) * s)
      }
    }
    onProgress(endY / height)
    await tick()
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}
