// Применение коррекции на GPU через WebGL-шейдер.
// Один проход по всему изображению — быстро даже для 15 Мпк и экономно по CPU.
// Математика В ТОЧНОСТИ повторяет ту, что использовалась при обучении модели:
//   1) яркость:      c = c * b
//   2) контраст:     c = (c - pivot) * k + pivot,  где pivot — средняя яркость кадра
//   3) насыщенность: c = gray + (c - gray) * s,    где gray — яркость пикселя

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform float u_bright;
uniform float u_contrast;
uniform float u_sat;
uniform float u_pivot;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
void main() {
  vec3 c = texture2D(u_image, v_uv).rgb;
  c = c * u_bright;
  c = (c - u_pivot) * u_contrast + u_pivot;
  float g = dot(c, LUMA);
  c = vec3(g) + (c - vec3(g)) * u_sat;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Ошибка компиляции шейдера: ' + gl.getShaderInfoLog(sh))
  }
  return sh
}

// Возвращает OffscreenCanvas с применённой коррекцией.
// Бросает исключение, если изображение больше лимита текстур GPU —
// тогда вызывающий код переходит на CPU-резерв.
export function applyWithGL(bitmap, coeffs) {
  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  // preserveDrawingBuffer — чтобы convertToBlob гарантированно прочитал отрисованное
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true })
  if (!gl) throw new Error('WebGL недоступен')

  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  if (width > maxTex || height > maxTex) {
    throw new Error('Изображение превышает лимит текстуры GPU')
  }

  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Ошибка линковки программы WebGL')
  }
  gl.useProgram(prog)

  // Полноэкранный треугольник
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  // Текстура с исходным изображением
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)

  // Опорная точка контраста — средняя яркость кадра после умножения на яркость
  const pivot = coeffs.meanLuma * coeffs.brightness

  gl.uniform1i(gl.getUniformLocation(prog, 'u_image'), 0)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_bright'), coeffs.brightness)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_contrast'), coeffs.contrast)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_sat'), coeffs.saturation)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_pivot'), pivot)

  gl.viewport(0, 0, width, height)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.flush()

  // Освобождаем ресурсы GL (canvas с результатом остаётся валидным)
  gl.deleteTexture(tex)
  gl.deleteBuffer(buf)
  gl.deleteProgram(prog)

  return canvas
}
