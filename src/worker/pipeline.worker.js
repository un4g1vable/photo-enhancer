// Web Worker: весь конвейер обработки выполняется здесь, чтобы интерфейс
// (главный поток) не блокировался. Этапы: декодирование → анализ моделью →
// применение коррекции (GPU, с резервом на CPU) → кодирование результата.

import { TASK_STATUS } from '../core/status.js'
import { loadModel, predictCoefficients } from './model.js'
import { decodeAndFit } from './decode.js'
import { applyWithGL } from './apply-gl.js'
import { applyWithCPU } from './apply-cpu.js'

const cancelled = new Set()

function post(type, payload) {
  self.postMessage({ type, payload })
}
function update(taskId, status, progress, extra = {}) {
  post('update', { taskId, status, progress, ...extra })
}
const isCancelled = (taskId) => cancelled.has(taskId)

// Прогреваем модель заранее, чтобы первая задача не ждала загрузку.
loadModel().then(
  () => post('ready', {}),
  (e) => post('ready', { error: String(e?.message || e) })
)

async function process(taskId, blob, outMime) {
  const startedAt = performance.now()
  let bitmap = null
  try {
    update(taskId, TASK_STATUS.DECODING, 8)
    const decoded = await decodeAndFit(blob)
    bitmap = decoded.bitmap
    if (isCancelled(taskId)) throw new Error('TASK_ABORTED')

    update(taskId, TASK_STATUS.ANALYZING, 28)
    const coeffs = await predictCoefficients(bitmap)
    if (isCancelled(taskId)) throw new Error('TASK_ABORTED')

    update(taskId, TASK_STATUS.APPLYING, 50, { coefficients: coeffs })

    let resultCanvas
    try {
      // Основной путь — GPU (быстро и экономно)
      resultCanvas = applyWithGL(bitmap, coeffs)
      update(taskId, TASK_STATUS.APPLYING, 82, { coefficients: coeffs })
    } catch (glErr) {
      // Резерв — CPU, по чанкам, с прогрессом и проверкой отмены
      resultCanvas = await applyWithCPU(
        bitmap,
        coeffs,
        (ratio) => update(taskId, TASK_STATUS.APPLYING, 50 + Math.round(ratio * 32), { coefficients: coeffs }),
        () => isCancelled(taskId)
      )
    }
    if (isCancelled(taskId)) throw new Error('TASK_ABORTED')

    update(taskId, TASK_STATUS.ENCODING, 92, { coefficients: coeffs })
    const quality = outMime === 'image/jpeg' ? 0.92 : undefined
    const resultBlob = await resultCanvas.convertToBlob({ type: outMime, quality })

    const durationMs = Math.round(performance.now() - startedAt)
    post('complete', {
      taskId,
      blob: resultBlob,
      coefficients: coeffs,
      metrics: { width: decoded.width, height: decoded.height, downscaled: decoded.downscaled, durationMs },
    })
  } catch (err) {
    if (String(err?.message) === 'TASK_ABORTED') {
      post('aborted', { taskId })
    } else {
      post('error', { taskId, error: String(err?.message || err) })
    }
  } finally {
    cancelled.delete(taskId)
    bitmap?.close?.()
  }
}

self.onmessage = (e) => {
  const { type, payload } = e.data || {}
  if (type === 'process') {
    process(payload.taskId, payload.blob, payload.outMime)
  } else if (type === 'cancel') {
    cancelled.add(payload.taskId)
  }
}
