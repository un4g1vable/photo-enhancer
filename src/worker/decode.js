import { MAX_MEGAPIXELS } from '../core/status.js'

// Декодирование изображения и приведение к рабочему размеру.
// JPG / PNG / BMP декодируются браузером нативно через createImageBitmap.
// HEIC к этому моменту уже сконвертирован в JPEG в основном потоке.
//
// Если изображение крупнее лимита (15 Мпк), оно пропорционально уменьшается —
// так пользователь всегда получает результат, а качество коррекции не страдает
// (модель в любом случае анализирует уменьшенную копию).
export async function decodeAndFit(blob) {
  let bitmap = await createImageBitmap(blob)
  let { width, height } = bitmap

  const maxPixels = MAX_MEGAPIXELS * 1_000_000
  const pixels = width * height
  let downscaled = false

  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels)
    const newW = Math.max(1, Math.round(width * scale))
    const newH = Math.max(1, Math.round(height * scale))
    const resized = await createImageBitmap(bitmap, {
      resizeWidth: newW,
      resizeHeight: newH,
      resizeQuality: 'high',
    })
    bitmap.close()
    bitmap = resized
    width = newW
    height = newH
    downscaled = true
  }

  return { bitmap, width, height, downscaled }
}
