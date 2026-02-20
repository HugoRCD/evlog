<script setup lang="ts">
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

interface Dot {
  x: number
  y: number
  baseSize: number
  baseAlpha: number
  phase: number
  pulseSpeed: number
}

let dots: Dot[] = []
let mouse = { x: -9999, y: -9999 }
let animationId: number
let ctx: CanvasRenderingContext2D | null = null
let dotSprite: HTMLCanvasElement | null = null
let dpr = 1
let w = 0
let h = 0
let t = 0
let gridSpacing = 0

function createDotSprite(): HTMLCanvasElement {
  const size = 64
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const sctx = c.getContext('2d')!
  const center = size / 2
  const grad = sctx.createRadialGradient(center, center, 0, center, center, center)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
  grad.addColorStop(0.15, 'rgba(255, 255, 255, 0.8)')
  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.25)')
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  sctx.fillStyle = grad
  sctx.fillRect(0, 0, size, size)
  return c
}

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967296
}

function fbm(x: number, y: number): number {
  let v = 0, a = 1, f = 1
  for (let i = 0; i < 4; i++) {
    v += a * Math.sin(x * f * 0.007 + y * f * 0.005 + i * 1.7)
      * Math.cos(y * f * 0.009 - x * f * 0.004 + i * 2.3)
    a *= 0.5
    f *= 2.2
  }
  return v
}

function densityAt(nx: number, ny: number): { size: number, alpha: number } {
  // Radial distance from visual center (slightly below page center)
  const dx = (nx - 0.5) * 2
  const dy = (ny - 0.55) * 2.2
  const dist = Math.sqrt(dx * dx + dy * dy)

  // Gentle edge fade (only at extreme edges)
  const edgeFade = Math.max(0, 1 - Math.pow(dist * 0.65, 2))
  if (edgeFade < 0.01) return { size: 0, alpha: 0 }

  // Order factor: center=1 (ordered), edges=0 (chaotic)
  const orderFactor = Math.max(0, 1 - dist * 0.9)

  // === CHAOS (edges) ===
  const chaosNoise = fbm(nx * w, ny * h)
  const chaosHash = hash(Math.floor(nx * 80), Math.floor(ny * 80))
  const chaosPresence = (chaosNoise * 0.5 + 0.5) * 0.6 + chaosHash * 0.4
  const chaosSize = chaosPresence * (1.5 + hash(Math.floor(nx * 120), Math.floor(ny * 120)) * 4)
  const chaosAlpha = chaosPresence * 0.8

  // === ORDER (center) ===
  const rowFreq = gridSpacing
  const rowPhase = (ny * h) % rowFreq
  const onRow = rowPhase < rowFreq * 0.4 ? 1 : 0.2
  const colPhase = (nx * w) % rowFreq
  const onCol = colPhase < rowFreq * 0.45 ? 1 : 0.25

  const orderPresence = onRow * onCol
  const orderSize = orderPresence * 3.5
  const orderAlpha = orderPresence * 1.2

  // === BLEND ===
  const size = (chaosSize * (1 - orderFactor) + orderSize * orderFactor) * edgeFade
  const alpha = (chaosAlpha * (1 - orderFactor) + orderAlpha * orderFactor) * edgeFade

  return { size: Math.max(0, size), alpha: Math.min(1, Math.max(0, alpha)) }
}

function buildDots() {
  dots = []
  const step = gridSpacing

  for (let x = step / 2; x < w; x += step) {
    for (let y = step / 2; y < h; y += step) {
      const nx = x / w
      const ny = y / h

      const { size, alpha } = densityAt(nx, ny)
      if (size < 0.1 || alpha < 0.01) continue

      // Jitter based on distance from center (chaos at edges)
      const ddx = (nx - 0.5) * 2
      const ddy = (ny - 0.55) * 2.2
      const ddist = Math.sqrt(ddx * ddx + ddy * ddy)
      const jitter = Math.min(1, ddist * 0.9) * step * 0.45
      const jx = x + (hash(Math.floor(x), Math.floor(y)) - 0.5) * jitter * 2
      const jy = y + (hash(Math.floor(y), Math.floor(x)) - 0.5) * jitter * 2

      dots.push({
        x: jx,
        y: jy,
        baseSize: size,
        baseAlpha: alpha,
        phase: hash(Math.floor(x * 7), Math.floor(y * 7)) * Math.PI * 2,
        pulseSpeed: 0.008 + hash(Math.floor(x * 3), Math.floor(y * 5)) * 0.02,
      })
    }
  }
}

function init() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return

  dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = container.getBoundingClientRect()
  w = rect.width
  h = rect.height

  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.scale(dpr, dpr)

  gridSpacing = Math.max(10, Math.min(16, w / 90))
  dotSprite = createDotSprite()
  buildDots()
}

function render() {
  if (!ctx || !dotSprite) return
  t++

  // Clear
  ctx.fillStyle = '#030303'
  ctx.fillRect(0, 0, w, h)

  // --- Grid (covers everything) ---
  ctx.lineWidth = 0.5

  // Grid is more visible near center (order) and fades at edges (chaos)
  for (let x = 0; x <= w; x += gridSpacing) {
    const nx = (x / w - 0.5) * 2
    const edgeDist = Math.abs(nx)
    const gridAlpha = 0.06 * Math.max(0.3, 1 - edgeDist * 0.6)
    ctx.strokeStyle = `rgba(255, 255, 255, ${gridAlpha})`
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }

  for (let y = 0; y <= h; y += gridSpacing) {
    const ny = ((y / h) - 0.55) * 2
    const edgeDist = Math.abs(ny)
    const gridAlpha = 0.06 * Math.max(0.3, 1 - edgeDist * 0.6)
    ctx.strokeStyle = `rgba(255, 255, 255, ${gridAlpha})`
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  // --- Dots ---
  const mouseRadius = 180
  ctx.globalCompositeOperation = 'lighter'

  for (const dot of dots) {
    const pulse = 1 + Math.sin(t * dot.pulseSpeed + dot.phase) * 0.12

    // Mouse illumination
    const mdx = dot.x - mouse.x
    const mdy = dot.y - mouse.y
    const mDist = Math.sqrt(mdx * mdx + mdy * mdy)
    const mouseGlow = mDist < mouseRadius
      ? Math.pow(1 - mDist / mouseRadius, 2) * 0.8
      : 0

    const size = dot.baseSize * pulse * (1 + mouseGlow * 0.4)
    const alpha = Math.min(1, dot.baseAlpha * pulse + mouseGlow * 0.5)

    if (alpha < 0.008 || size < 0.2) continue

    const spriteSize = size * 6
    ctx.globalAlpha = alpha

    ctx.drawImage(
      dotSprite,
      dot.x - spriteSize / 2,
      dot.y - spriteSize / 2,
      spriteSize,
      spriteSize,
    )
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1

  animationId = requestAnimationFrame(render)
}

function handleMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  mouse.x = e.clientX - rect.left
  mouse.y = e.clientY - rect.top
}

function handleMouseLeave() {
  mouse.x = -9999
  mouse.y = -9999
}

let resizeTimer: ReturnType<typeof setTimeout>
function handleResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    cancelAnimationFrame(animationId)
    init()
    render()
  }, 200)
}

onMounted(() => {
  init()
  render()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div
    ref="containerRef"
    class="absolute inset-0 z-0"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <canvas ref="canvasRef" class="absolute inset-0" />
  </div>
</template>
