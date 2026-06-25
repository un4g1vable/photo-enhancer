// Поддержка HEIC/HEIF. Эти форматы не декодируются большинством браузеров
// нативно (кроме Safari на устройствах Apple), поэтому используется JS-декодер.
// Библиотека подгружается ЛЕНИВО — только если пользователь действительно
// загрузил HEIC, чтобы не утяжелять обычный старт приложения.

export function isHeic(file) {
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  return (
    type.includes('heic') ||
    type.includes('heif') ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  )
}

// Конвертирует HEIC-файл в JPEG-Blob. Выполняется в основном потоке,
// так как декодер опирается на DOM-API canvas.
export async function heicToBlob(file) {
  const { default: heic2any } = await import('heic2any')
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 })
  // heic2any может вернуть массив (для многокадровых HEIC) — берём первый кадр
  return Array.isArray(result) ? result[0] : result
}
