import './styles.css'
import { enhancer } from './api/enhancer.js'
import { TASK_STATUS, STATUS_LABEL, FINAL_STATUSES } from './core/status.js'
import { createCompare } from './ui/compare.js'

const ACCEPT = '.jpg,.jpeg,.png,.bmp,.heic,.heif,image/*'

document.getElementById('app').innerHTML = `
  <header class="hero">
    <h1>Улучшение изображений</h1>
    <p class="hero__sub">ML-модель в браузере · яркость · контраст · цветность · без отправки на сервер</p>
    <div class="model-status" id="model-status"><span class="dot"></span> Загрузка модели…</div>
  </header>

  <main class="container">
    <label class="drop" id="drop">
      <input type="file" id="file-input" accept="${ACCEPT}" multiple hidden />
      <div class="drop__inner">
        <div class="drop__icon">🖼️</div>
        <div class="drop__title">Перетащите изображения сюда</div>
        <div class="drop__hint">или нажмите для выбора · JPG, PNG, BMP, HEIC · до 15 Мпк</div>
      </div>
    </label>
    <div id="tasks" class="tasks"></div>
  </main>

  <footer class="foot">Обработка выполняется локально в вашем браузере.</footer>`

const dropEl = document.getElementById('drop')
const inputEl = document.getElementById('file-input')
const tasksEl = document.getElementById('tasks')
const modelStatusEl = document.getElementById('model-status')

// --- Статус модели ---
enhancer.addEventListener('ready', (e) => {
  if (e.detail?.error) {
    modelStatusEl.innerHTML = `<span class="dot dot--err"></span> Ошибка загрузки модели`
    modelStatusEl.classList.add('is-error')
  } else {
    modelStatusEl.innerHTML = `<span class="dot dot--ok"></span> Модель готова`
    modelStatusEl.classList.add('is-ready')
  }
})

// --- Загрузка файлов ---
function handleFiles(fileList) {
  for (const file of fileList) {
    const id = enhancer.createTask(file)
    renderCard(id)
  }
}

inputEl.addEventListener('change', () => { handleFiles(inputEl.files); inputEl.value = '' })
dropEl.addEventListener('dragover', (e) => { e.preventDefault(); dropEl.classList.add('drop--over') })
dropEl.addEventListener('dragleave', () => dropEl.classList.remove('drop--over'))
dropEl.addEventListener('drop', (e) => {
  e.preventDefault()
  dropEl.classList.remove('drop--over')
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files)
})

// --- Карточки задач ---
const cards = new Map()

function renderCard(id) {
  const card = document.createElement('article')
  card.className = 'card'
  card.innerHTML = `
    <div class="card__head">
      <span class="card__name"></span>
      <span class="card__status"></span>
    </div>
    <div class="progress"><div class="progress__bar"></div></div>
    <div class="card__body"></div>
    <div class="card__error"></div>`
  tasksEl.prepend(card)
  cards.set(id, card)

  updateCard(enhancer.list().find((t) => t.id === id))
}

// Расходящиеся полоски: центр = «без изменений» (×1.0). Заполнение вправо —
// коэффициент усилил параметр, влево — ослабил. Длина пропорциональна
// величине правки (отклонение ×1.0 = половина дорожки, дальше — упор).
function renderCoeffs(c) {
  if (!c) return ''
  const rows = [
    ['Яркость', c.brightness],
    ['Контраст', c.contrast],
    ['Цветность', c.saturation],
  ]
  const bars = rows.map(([label, v]) => {
    const delta = Math.round((v - 1) * 100)
    const mag = Math.min(50, Math.abs(v - 1) * 50) // % дорожки от центра, упор 50
    const sign = delta > 0 ? '+' : ''
    const dir = delta >= 0 ? 'pos' : 'neg'
    return `
      <div class="bar">
        <span class="bar__label">${label}</span>
        <span class="bar__track">
          <span class="bar__fill bar__fill--${dir}" style="--mag:${mag.toFixed(1)}%"></span>
        </span>
        <span class="bar__val bar__val--${dir}">${sign}${delta}%</span>
      </div>`
  }).join('')
  return `<div class="bars">${bars}</div>`
}

function updateCard(task) {
  if (!task) return
  const card = cards.get(task.id)
  if (!card) return

  card.querySelector('.card__name').textContent = task.fileName
  const statusEl = card.querySelector('.card__status')
  statusEl.textContent = STATUS_LABEL[task.status] || task.status
  statusEl.className = 'card__status card__status--' + task.status

  card.querySelector('.progress__bar').style.width = task.progress + '%'
  card.classList.toggle('is-done', task.status === TASK_STATUS.DONE)

  const body = card.querySelector('.card__body')
  const errEl = card.querySelector('.card__error')
  errEl.textContent = task.status === TASK_STATUS.ERROR ? task.error : ''

  if (task.status === TASK_STATUS.DONE) {
    if (!card.dataset.rendered) {
      card.dataset.rendered = '1'
      body.innerHTML = ''
      body.appendChild(createCompare(task.originalUrl, task.resultUrl))

      const meta = document.createElement('div')
      meta.className = 'card__meta'
      const mp = task.metrics ? ((task.metrics.width * task.metrics.height) / 1e6).toFixed(1) : '?'
      meta.innerHTML = `
        ${renderCoeffs(task.coefficients)}
        <div class="info">${mp} Мпк · ${task.metrics?.durationMs ?? '?'} мс${task.metrics?.downscaled ? ' · уменьшено до 15 Мпк' : ''}</div>`
      body.appendChild(meta)

      const actions = document.createElement('div')
      actions.className = 'card__actions'
      const dl = document.createElement('a')
      dl.className = 'btn btn--primary'
      dl.textContent = 'Скачать'
      dl.href = task.resultUrl
      const ext = task.resultBlob?.type === 'image/png' ? 'png' : 'jpg'
      dl.download = task.fileName.replace(/\.[^.]+$/, '') + '_enhanced.' + ext
      actions.appendChild(dl)
      body.appendChild(actions)
    }
  } else if (!FINAL_STATUSES.has(task.status)) {
    // идёт обработка — показываем кнопку отмены
    if (!body.querySelector('.btn--cancel')) {
      body.innerHTML = ''
      const cancel = document.createElement('button')
      cancel.className = 'btn btn--cancel'
      cancel.textContent = 'Отменить'
      cancel.onclick = () => enhancer.abort(task.id)
      body.appendChild(cancel)
    }
  } else if (task.status === TASK_STATUS.ABORTED) {
    body.innerHTML = '<div class="muted">Задача отменена</div>'
  }
}

enhancer.subscribe(updateCard)
