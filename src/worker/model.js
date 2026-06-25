import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import { loadGraphModel } from '@tensorflow/tfjs-converter'

// Загрузка ML-модели (TensorFlow.js GraphModel) и предсказание коэффициентов.
// Модель принимает изображение 224x224x3 в диапазоне [0,1] и возвращает три
// логарифма коэффициентов восстановления (яркость, контраст, насыщенность).

// Путь к статике (папка public) с учётом base. Строим абсолютный URL от origin,
// чтобы корректно работало и в dev, и при сборке под любой base (вкл. GitHub Pages).
const BASE = import.meta.env.BASE_URL || '/'
const asset = (p) => new URL(BASE + p, self.location.origin).href
const MODEL_URL = asset('model/model.json')

let modelPromise = null
let config = null

export async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend('webgl')
      await tf.ready()
      const [model, cfg] = await Promise.all([
        loadGraphModel(MODEL_URL),
        fetch(asset('model/inference_config.json'))
          .then((r) => r.json())
          .catch(() => null),
      ])
      config = cfg
      return model
    })()
  }
  return modelPromise
}

// Пределы коэффициентов восстановления (= 1 / диапазон деградации).
// Защищают от чрезмерной коррекции, если модель выдаст экстремальное значение.
function restoreBounds(range) {
  // range — диапазон деградации, например [0.7, 1.3]; восстановление = 1/деградация
  return [1 / range[1], 1 / range[0]]
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

const INPUT = 224

// Готовит вход модели: центральный квадратный кроп + ресайз до 224 + [0,1].
// Заодно возвращает среднюю яркость уменьшенной копии — она нужна как опорная
// точка («pivot») при применении контраста.
function buildInput(bitmap) {
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = new OffscreenCanvas(INPUT, INPUT)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, INPUT, INPUT)
  const { data } = ctx.getImageData(0, 0, INPUT, INPUT)

  const rgb = new Float32Array(INPUT * INPUT * 3)
  let lumaSum = 0
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
    rgb[j] = r; rgb[j + 1] = g; rgb[j + 2] = b
    lumaSum += 0.299 * r + 0.587 * g + 0.114 * b
  }
  return { rgb, meanLuma: lumaSum / (INPUT * INPUT) }
}

export async function predictCoefficients(bitmap) {
  const model = await loadModel()
  const { rgb, meanLuma } = buildInput(bitmap)

  const logCoeffs = tf.tidy(() => {
    const input = tf.tensor4d(rgb, [1, INPUT, INPUT, 3])
    const out = model.execute(input)
    const t = Array.isArray(out) ? out[0] : out
    return t.dataSync()
  })

  const bRange = config?.ranges?.brightness ?? [0.7, 1.3]
  const cRange = config?.ranges?.contrast ?? [0.7, 1.3]
  const sRange = config?.ranges?.saturation ?? [0.6, 1.4]
  const [bLo, bHi] = restoreBounds(bRange)
  const [cLo, cHi] = restoreBounds(cRange)
  const [sLo, sHi] = restoreBounds(sRange)

  return {
    brightness: clamp(Math.exp(logCoeffs[0]), bLo, bHi),
    contrast: clamp(Math.exp(logCoeffs[1]), cLo, cHi),
    saturation: clamp(Math.exp(logCoeffs[2]), sLo, sHi),
    meanLuma,
  }
}
