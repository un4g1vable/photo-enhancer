// Статусы задачи обработки и их человекочитаемые названия.
// Используются и в основном потоке, и в воркере.
export const TASK_STATUS = {
  QUEUED: 'queued',
  DECODING: 'decoding',
  ANALYZING: 'analyzing',
  APPLYING: 'applying',
  ENCODING: 'encoding',
  DONE: 'done',
  ERROR: 'error',
  ABORTED: 'aborted',
}

export const STATUS_LABEL = {
  queued: 'в очереди',
  decoding: 'декодирование',
  analyzing: 'анализ модели',
  applying: 'коррекция',
  encoding: 'сохранение',
  done: 'готово',
  error: 'ошибка',
  aborted: 'отменено',
}

export const FINAL_STATUSES = new Set([
  TASK_STATUS.DONE,
  TASK_STATUS.ERROR,
  TASK_STATUS.ABORTED,
])

// Предел по числу мегапикселей (по ТЗ — до 15 Мпк).
export const MAX_MEGAPIXELS = 15
