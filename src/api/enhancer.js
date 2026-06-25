// Публичный API модуля обработки (по ТЗ), реализованный поверх Web Worker.
//
//   createTask(file)   -> id          — поставить задачу, вернуть идентификатор
//   getStatus(id)      -> {status,progress,...}
//   abort(id)          -> {ok}         — прервать задачу
//   getResult(id)      -> Blob | null  — получить готовое изображение
//   subscribe(fn)      -> unsubscribe  — событие изменения задачи
//
// Класс наследует EventTarget: при каждом изменении статуса/прогресса
// рассылается событие 'change' с актуальным состоянием задачи.

import { TASK_STATUS, FINAL_STATUSES } from '../core/status.js'
import { isHeic, heicToBlob } from '../core/heic.js'

function newId() {
  return (crypto.randomUUID?.() || 'task-' + Math.random().toString(36).slice(2))
}

function outputMime(file) {
  const t = (file.type || '').toLowerCase()
  const n = (file.name || '').toLowerCase()
  if (t === 'image/png' || n.endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

export class ImageEnhancer extends EventTarget {
  constructor() {
    super()
    this.tasks = new Map()
    this.ready = false
    this.worker = new Worker(new URL('../worker/pipeline.worker.js', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', (e) => this._onWorkerMessage(e))
  }

  // --- Публичные методы API ---

  createTask(file) {
    const id = newId()
    const task = {
      id,
      fileName: file.name || 'image',
      fileSize: file.size,
      status: TASK_STATUS.QUEUED,
      progress: 0,
      error: null,
      originalUrl: URL.createObjectURL(file),
      resultUrl: null,
      resultBlob: null,
      coefficients: null,
      metrics: null,
      createdAt: Date.now(),
      finishedAt: null,
    }
    this.tasks.set(id, task)
    this._emit(task)
    this._start(id, file)
    return id
  }

  getStatus(id) {
    const t = this.tasks.get(id)
    if (!t) return null
    return { id: t.id, status: t.status, progress: t.progress, coefficients: t.coefficients }
  }

  abort(id) {
    const t = this.tasks.get(id)
    if (!t || FINAL_STATUSES.has(t.status)) return { ok: false }
    this.worker.postMessage({ type: 'cancel', payload: { taskId: id } })
    return { ok: true }
  }

  getResult(id) {
    return this.tasks.get(id)?.resultBlob ?? null
  }

  subscribe(listener) {
    const handler = (e) => listener(e.detail)
    this.addEventListener('change', handler)
    return () => this.removeEventListener('change', handler)
  }

  list() {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  // --- Внутреннее ---

  async _start(id, file) {
    try {
      let blob = file
      if (isHeic(file)) {
        this._patch(id, { status: TASK_STATUS.DECODING, progress: 4 })
        blob = await heicToBlob(file) // конвертация HEIC в основном потоке
      }
      this.worker.postMessage({ type: 'process', payload: { taskId: id, blob, outMime: outputMime(file) } })
    } catch (err) {
      this._patch(id, { status: TASK_STATUS.ERROR, error: 'Не удалось открыть файл: ' + (err?.message || err), finishedAt: Date.now() })
    }
  }

  _onWorkerMessage(e) {
    const { type, payload } = e.data || {}
    if (type === 'ready') {
      this.ready = true
      this.dispatchEvent(new CustomEvent('ready', { detail: payload }))
      return
    }
    const t = this.tasks.get(payload?.taskId)
    if (!t) return

    if (type === 'update') {
      this._patch(t.id, { status: payload.status, progress: payload.progress, coefficients: payload.coefficients ?? t.coefficients })
    } else if (type === 'complete') {
      if (t.resultUrl) URL.revokeObjectURL(t.resultUrl)
      this._patch(t.id, {
        status: TASK_STATUS.DONE,
        progress: 100,
        resultBlob: payload.blob,
        resultUrl: URL.createObjectURL(payload.blob),
        coefficients: payload.coefficients,
        metrics: payload.metrics,
        finishedAt: Date.now(),
      })
    } else if (type === 'aborted') {
      this._patch(t.id, { status: TASK_STATUS.ABORTED, progress: 0, finishedAt: Date.now() })
    } else if (type === 'error') {
      this._patch(t.id, { status: TASK_STATUS.ERROR, error: payload.error, finishedAt: Date.now() })
    }
  }

  _patch(id, patch) {
    const t = this.tasks.get(id)
    if (!t) return
    Object.assign(t, patch)
    this._emit(t)
  }

  _emit(task) {
    this.dispatchEvent(new CustomEvent('change', { detail: { ...task } }))
  }
}

// Единый экземпляр на приложение.
export const enhancer = new ImageEnhancer()
