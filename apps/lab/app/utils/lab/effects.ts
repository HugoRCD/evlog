/**
 * A library of entrance and exit effects, attachable to any layer.
 *
 * Each one is a function of how far through its ramp the clip is, returning a
 * displacement from the layer's resting state: an opacity multiplier, an offset,
 * a depth, a scale, a rotation. They compose, so a title can slide up while it
 * fades and settles forward all at once.
 *
 * This is only cheap because layers became their own planes. Every quantity
 * below is a shader uniform, so an effect changes numbers between draw calls and
 * never touches a texture — where an effect written into the stage's markup used
 * to re-rasterize the whole stage on every frame it ran.
 */

export type EasingName = 'linear' | 'out' | 'inOut' | 'outBack' | 'outExpo'

/**
 * Easings, all normalised to f(0) = 0 and f(1) = 1.
 *
 * `outBack` overshoots on purpose — it is what gives an entrance a bit of weight
 * rather than the mechanical arrival of a linear ramp.
 */
export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: t => t,
  out: t => 1 - (1 - t) ** 3,
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => {
    const c = 1.70158
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
  },
  outExpo: t => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
}

export const EASING_NAMES = Object.keys(EASINGS) as EasingName[]

export type EffectKind = 'fade' | 'slide' | 'scale' | 'dolly' | 'spin'

export type EffectDirection = 'left' | 'right' | 'up' | 'down'

export interface LayerEffect {
  kind: EffectKind
  /** Whether the ramp runs at the head of the clip or its tail. */
  at: 'in' | 'out'
  duration: number
  easing: EasingName
  /** What the effect travels through. Units depend on the kind. */
  amount: number
  direction?: EffectDirection
}

export interface EffectDescriptor {
  kind: EffectKind
  label: string
  /** One line, shown next to the effect so the amount means something. */
  amountLabel: string
  amountRange: { min: number, max: number, step: number }
  defaultAmount: number
  hasDirection: boolean
}

export const EFFECT_LIBRARY: EffectDescriptor[] = [
  {
    kind: 'fade',
    label: 'Fade',
    // Not "From": it reads as a range bound rather than as the opacity the ramp
    // begins at, and a fade left at 0.65 looks like an effect doing nothing.
    amountLabel: 'Starts at',
    amountRange: { min: 0, max: 1, step: 0.01 },
    defaultAmount: 0,
    hasDirection: false,
  },
  {
    kind: 'slide',
    label: 'Slide',
    amountLabel: 'Distance',
    amountRange: { min: 0, max: 3, step: 0.01 },
    defaultAmount: 0.4,
    hasDirection: true,
  },
  {
    kind: 'scale',
    label: 'Scale',
    amountLabel: 'Starts at',
    amountRange: { min: 0.1, max: 3, step: 0.01 },
    defaultAmount: 0.7,
    hasDirection: false,
  },
  {
    kind: 'dolly',
    label: 'Dolly',
    amountLabel: 'Depth',
    amountRange: { min: -3, max: 3, step: 0.01 },
    defaultAmount: 0.8,
    hasDirection: false,
  },
  {
    kind: 'spin',
    label: 'Spin',
    amountLabel: 'Angle',
    amountRange: { min: -180, max: 180, step: 1 },
    defaultAmount: -12,
    hasDirection: false,
  },
]

export function createEffect(kind: EffectKind, at: 'in' | 'out'): LayerEffect {
  const descriptor = EFFECT_LIBRARY.find(entry => entry.kind === kind) ?? EFFECT_LIBRARY[0]!
  return {
    kind,
    at,
    duration: 600,
    // Entrances want to decelerate into place; exits want to leave without
    // hesitating, which a symmetric curve does not do.
    easing: at === 'in' ? 'out' : 'inOut',
    amount: descriptor.defaultAmount,
    direction: descriptor.hasDirection ? (at === 'in' ? 'up' : 'down') : undefined,
  }
}

export interface EffectResult {
  /** Multiplier on the layer's own opacity. */
  opacity: number
  offsetX: number
  offsetY: number
  depth: number
  scale: number
  rotation: number
}

const IDENTITY: EffectResult = { opacity: 1, offsetX: 0, offsetY: 0, depth: 0, scale: 1, rotation: 0 }

const DIRECTION_VECTORS: Record<EffectDirection, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, 1],
  down: [0, -1],
}

/**
 * Combine every effect on a layer at one instant.
 *
 * `progress` runs 0 → 1 as the effect completes, so `1 - progress` is how far
 * the layer still is from where it comes to rest. Effects multiply for opacity
 * and scale and add for everything else, which is what lets several run at once
 * without one cancelling another.
 */
export function evaluateEffects(effects: LayerEffect[] | undefined, localTime: number, clipDuration: number): EffectResult {
  if (!effects?.length) return IDENTITY

  const result: EffectResult = { ...IDENTITY }

  for (const effect of effects) {
    const duration = Math.max(1, effect.duration)
    const elapsed = effect.at === 'in' ? localTime : clipDuration - localTime
    // Past the ramp the layer is simply at rest; before it, fully displaced.
    const raw = Math.min(1, Math.max(0, elapsed / duration))
    const progress = (EASINGS[effect.easing] ?? EASINGS.out)(raw)
    const remaining = 1 - progress

    switch (effect.kind) {
      case 'fade':
        result.opacity *= effect.amount + (1 - effect.amount) * progress
        break
      case 'slide': {
        const [dx, dy] = DIRECTION_VECTORS[effect.direction ?? 'up']
        result.offsetX += dx * effect.amount * remaining
        result.offsetY += dy * effect.amount * remaining
        break
      }
      case 'scale':
        result.scale *= effect.amount + (1 - effect.amount) * progress
        break
      case 'dolly':
        result.depth += effect.amount * remaining
        break
      case 'spin':
        result.rotation += effect.amount * remaining
        break
    }
  }

  return result
}

/**
 * How long a clip spends arriving, or leaving, in milliseconds.
 *
 * The timeline draws this as a ramp, so a clip can say how long its animation
 * lasts rather than only that it has one. The longest at that end wins: effects
 * sharing an end run together, and the clip is still arriving until the slowest
 * of them has landed.
 */
export function effectRampMs(effects: LayerEffect[] | undefined, at: 'in' | 'out'): number {
  if (!effects?.length) return 0
  return effects.reduce((longest, effect) => (
    effect.at === at ? Math.max(longest, effect.duration) : longest
  ), 0)
}

/** Drop anything unrecognised, so a stale document cannot break a render. */
export function sanitizeEffects(value: unknown): LayerEffect[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const effect = entry as LayerEffect
    if (!EFFECT_LIBRARY.some(descriptor => descriptor.kind === effect.kind)) return []
    return [
      {
        kind: effect.kind,
        at: effect.at === 'out' ? 'out' : 'in',
        duration: Number.isFinite(effect.duration) ? Math.max(1, effect.duration) : 600,
        easing: EASING_NAMES.includes(effect.easing) ? effect.easing : 'out',
        amount: Number.isFinite(effect.amount) ? effect.amount : 0,
        direction: effect.direction,
      }
    ]
  })
}
