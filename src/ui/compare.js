// Интерактивное сравнение «до/после»: изображение «после» наложено поверх
// «до» и обрезается по позиции разделителя через clip-path (надёжно при любой
// ширине). Разделитель перетаскивается мышью или пальцем.
export function createCompare(beforeUrl, afterUrl) {
  const el = document.createElement('div')
  el.className = 'compare'
  el.innerHTML = `
    <img class="compare__img compare__img--before" src="${beforeUrl}" alt="исходное" draggable="false" />
    <img class="compare__img compare__img--after" src="${afterUrl}" alt="улучшено" draggable="false" />
    <div class="compare__divider"><span class="compare__handle">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 7 L5.5 12 L10 17" /><path d="M14 7 L18.5 12 L14 17" />
      </svg></span></div>
    <span class="compare__tag compare__tag--l">до</span>
    <span class="compare__tag compare__tag--r">после</span>`

  const afterImg = el.querySelector('.compare__img--after')
  const divider = el.querySelector('.compare__divider')

  const setPos = (p) => {
    const pos = Math.max(0, Math.min(100, p))
    afterImg.style.clipPath = `inset(0 0 0 ${pos}%)`
    divider.style.left = pos + '%'
  }
  setPos(50)

  const moveTo = (clientX) => {
    const r = el.getBoundingClientRect()
    setPos(((clientX - r.left) / r.width) * 100)
  }

  // Плавный переход — только для авто-подсказки; при перетаскивании отключаем,
  // чтобы шторка шла строго за курсором без задержки.
  const setEased = (on) => {
    afterImg.style.transition = on ? 'clip-path .9s ease' : ''
    divider.style.transition = on ? 'left .9s ease' : ''
  }

  let dragging = false
  const down = (e) => { setEased(false); dragging = true; moveTo((e.touches ? e.touches[0] : e).clientX); e.preventDefault() }
  const move = (e) => { if (dragging) moveTo((e.touches ? e.touches[0] : e).clientX) }
  const up = () => { dragging = false }

  el.addEventListener('mousedown', down)
  el.addEventListener('touchstart', down, { passive: false })
  window.addEventListener('mousemove', move)
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('mouseup', up)
  window.addEventListener('touchend', up)

  // Одноразовая подсказка: после появления разделитель сам проезжает
  // вправо-влево-в центр — сразу видно, что под шторкой две разные версии.
  let hinted = false
  const runHint = () => {
    if (hinted || dragging) return
    hinted = true
    setEased(true)
    setPos(82)
    setTimeout(() => !dragging && setPos(18), 950)
    setTimeout(() => !dragging && setPos(50), 1900)
    setTimeout(() => setEased(false), 2850)
  }
  if (afterImg.complete) requestAnimationFrame(() => setTimeout(runHint, 300))
  else afterImg.addEventListener('load', () => setTimeout(runHint, 300), { once: true })

  return el
}
