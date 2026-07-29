/**
 * GLSL for the Render labs pipeline.
 *
 * The chain is: stage (DOM plane in 3D) → DOF → bloom (down/up mip chain) →
 * composite (aberration, tonemap, grade, vignette, grain).
 *
 * Everything between the stage and the composite runs in linear light. The DOM
 * texture is sRGB, so the stage decodes on read and the composite encodes on
 * write — bloom and DOF averaging pixels in sRGB is what makes naive glow look
 * grey and muddy instead of hot.
 */

/** sRGB ↔ linear, plus the signed-CoC packing shared by the stage and DOF passes. */
const COMMON = `
vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// CoC is signed — negative in front of the focal plane, positive behind — and
// rides in the alpha channel, so it is remapped to 0..1 to survive an 8-bit
// target on drivers without renderable half-float.
float packCoc(float coc) { return clamp(coc * 0.5 + 0.5, 0.0, 1.0); }
float unpackCoc(float packed) { return packed * 2.0 - 1.0; }
`

/**
 * Renders the DOM texture as a plane floating in front of the camera.
 *
 * Rather than rasterizing a quad, each fragment casts a ray and intersects the
 * plane analytically. That yields exact UVs under any tilt (no interpolation
 * artifacts at grazing angles), an exact view-space depth for the DOF pass, and
 * a free background test — a ray that misses the plane simply is the backdrop.
 */
export const STAGE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
// Colour and depth of field travel in separate outputs. Sharing one target
// means the blend equation treats a circle of confusion as an opacity.
layout(location = 0) out vec4 outColour;
layout(location = 1) out vec4 outCoc;

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec2 uPlaneSize;      // half-extents of the plane in world units
uniform vec3 uPlaneOffset;    // pan (xy) and dolly (z) applied to the plane centre
uniform vec3 uRotation;       // pitch, yaw, roll in radians
uniform float uTanHalfFov;
uniform float uFocusNear;     // view depth of the plate's nearest corner
uniform float uFocusFar;      // ...and its farthest
uniform float uFocus;         // focal plane, 0..1 across that span
uniform float uFocusRange;    // half-width of the sharp band, in the same units
uniform float uReferenceDistance;
uniform float uAperture;
uniform float uAttenuation;   // dims the plane as it recedes
uniform vec3 uBackground;
uniform float uEmission;      // pushes the plate above 1.0 so bloom has something to catch
uniform float uOpacity;       // layer opacity, so a fade never touches the texture

${COMMON}

mat3 rotation(vec3 r) {
  float cx = cos(r.x), sx = sin(r.x);
  float cy = cos(r.y), sy = sin(r.y);
  float cz = cos(r.z), sz = sin(r.z);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, -sx, 0.0, sx, cx);
  mat3 ry = mat3(cy, 0.0, sy, 0.0, 1.0, 0.0, -sy, 0.0, cy);
  mat3 rz = mat3(cz, -sz, 0.0, sz, cz, 0.0, 0.0, 0.0, 1.0);
  return ry * rx * rz;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;

  // Camera sits at the origin looking down -Z.
  vec3 dir = normalize(vec3(ndc.x * aspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));

  mat3 basis = rotation(uRotation);
  vec3 right = basis * vec3(1.0, 0.0, 0.0);
  vec3 up = basis * vec3(0.0, 1.0, 0.0);
  vec3 normal = basis * vec3(0.0, 0.0, 1.0);
  vec3 centre = vec3(uPlaneOffset.xy, -uPlaneOffset.z);

  float denom = dot(dir, normal);
  vec3 colour = vec3(0.0);
  float coc = 0.0;
  float alpha = 0.0;

  // A near-zero denominator means the ray is parallel to the plane (edge-on);
  // there is nothing to hit and the division would blow up.
  if (abs(denom) > 1e-5) {
    float t = dot(centre, normal) / denom;
    if (t > 0.0) {
      vec3 hit = dir * t;
      vec3 local = hit - centre;
      vec2 planar = vec2(dot(local, right), dot(local, up)) / uPlaneSize;
      if (all(lessThanEqual(abs(planar), vec2(1.0)))) {
        vec2 uv = planar * 0.5 + 0.5;
        vec4 texel = texture(uSource, uv);
        vec3 plate = toLinear(texel.rgb) * uEmission;

        // Inverse-square-ish falloff normalised at the camera distance, so
        // dialling attenuation up reads as depth rather than as a global
        // exposure change — and stays put when focus is racked.
        float ratio = uReferenceDistance / max(-hit.z, 1e-3);
        float falloff = mix(1.0, ratio * ratio, uAttenuation);

        // Every plane composites over what is already there; the background is
        // the target's clear value, not something a plane paints.
        colour = plate * falloff;
        alpha = texel.a * uOpacity;

        // Where this fragment sits between the plate's nearest and farthest
        // corner. Working in this normalised span rather than in world distance
        // is what keeps the focus control meaningful: the plate's actual depth
        // range shifts with every change of tilt, aspect and zoom, so a focal
        // distance in world units lands outside it as soon as anything else is
        // touched, and most of the slider's travel does nothing.
        float span = uFocusFar - uFocusNear;
        if (span > 1e-4) {
          float position = (-hit.z - uFocusNear) / span;
          // Signed, so the DOF pass can tell near bokeh from far bokeh, and
          // saturating at ±1 so the band edge is where blur stops growing.
          coc = clamp((position - uFocus) / max(uFocusRange, 1e-3), -1.0, 1.0) * uAperture;
        }
      }
    }
  }

  // Nothing to contribute: leave the target untouched rather than stamping this
  // plane's circle of confusion over pixels it does not cover.
  if (alpha < 0.004) discard;

  // Premultiplied, so both outputs composite with the same one-minus-source-alpha
  // blend and a partially covered edge contributes its own share of both colour
  // and focus.
  outColour = vec4(colour * alpha, alpha);
  outCoc = vec4(vec3(packCoc(coc) * alpha), alpha);
}`

/**
 * Depth of field.
 *
 * Gathers along a golden-angle spiral — uniform disc coverage without the
 * ring-shaped banding a concentric-rings kernel leaves in smooth gradients.
 *
 * The weight test is what keeps it honest: a tap only contributes if its own
 * CoC is wide enough to actually reach the centre pixel. Without it, a blurred
 * background bleeds over a sharp foreground edge and objects get a halo.
 */
export const DOF_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform sampler2D uCocMap;
uniform vec2 uTexel;
uniform float uMaxRadius;   // in pixels
uniform int uSamples;

${COMMON}

const float GOLDEN_ANGLE = 2.39996323;

void main() {
  vec4 centre = texture(uSource, vUv);
  float centreCoc = unpackCoc(texture(uCocMap, vUv).r);
  float centreRadius = abs(centreCoc) * uMaxRadius;

  // Under a pixel of blur there is nothing to gather; skip the whole kernel.
  if (centreRadius < 0.75 || uSamples <= 1) {
    fragColor = centre;
    return;
  }

  vec3 sum = centre.rgb;
  float weightSum = 1.0;
  float count = float(uSamples);

  for (int i = 1; i < 256; i++) {
    if (i >= uSamples) break;
    float fi = float(i);
    // sqrt keeps the spiral area-uniform instead of clustering at the centre.
    float radius = sqrt(fi / count);
    float angle = fi * GOLDEN_ANGLE;
    vec2 offset = vec2(cos(angle), sin(angle)) * radius;

    vec2 uv = vUv + offset * centreRadius * uTexel;
    vec4 tap = texture(uSource, uv);
    float tapRadius = abs(unpackCoc(texture(uCocMap, uv).r)) * uMaxRadius;
    float distance = radius * centreRadius;

    // Accept the tap when its own blur disc covers this pixel, or when this
    // pixel is itself blurred enough to be gathering that far.
    //
    // The asymmetry is the point. A blurred pixel legitimately collects light
    // from everything inside its circle of confusion, sharp neighbours included;
    // a sharp pixel has a tiny radius and so never reaches its blurred ones,
    // which is what stops a soft background from haloing over a crisp edge.
    // Halving the centre's reach here — an earlier, more cautious guess — capped
    // blurred regions at half their intended radius and made wide apertures look
    // far weaker than they were.
    float reach = max(tapRadius, centreRadius);
    float weight = clamp(reach - distance + 1.0, 0.0, 1.0);

    sum += tap.rgb * weight;
    weightSum += weight;
  }

  fragColor = vec4(sum / weightSum, 1.0);
}`

/** Isolates what should glow, with a soft knee so the threshold has no hard edge. */
export const BLOOM_PREFILTER_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform float uThreshold;
uniform float uKnee;

void main() {
  vec3 colour = texture(uSource, vUv).rgb;
  float brightness = max(colour.r, max(colour.g, colour.b));

  // Quadratic knee: below threshold-knee nothing passes, above threshold+knee
  // everything does, and the transition in between is smooth. A hard cutoff
  // makes glow pop in and out as a gradient drifts across the threshold.
  float soft = brightness - uThreshold + uKnee;
  soft = clamp(soft, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contribution = max(soft, brightness - uThreshold) / max(brightness, 1e-5);

  fragColor = vec4(colour * contribution, 1.0);
}`

/**
 * 13-tap downsample.
 *
 * The partial-Karis average over four overlapping quads is what stops a single
 * blown-out pixel from producing a stable flickering star as it moves — plain
 * box filtering aliases badly on the small mips.
 */
export const BLOOM_DOWN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uTexel;

vec3 fetch(vec2 offset) {
  return texture(uSource, vUv + offset * uTexel).rgb;
}

void main() {
  vec3 a = fetch(vec2(-2.0, 2.0)), b = fetch(vec2(0.0, 2.0)), c = fetch(vec2(2.0, 2.0));
  vec3 d = fetch(vec2(-2.0, 0.0)), e = fetch(vec2(0.0, 0.0)), f = fetch(vec2(2.0, 0.0));
  vec3 g = fetch(vec2(-2.0, -2.0)), h = fetch(vec2(0.0, -2.0)), i = fetch(vec2(2.0, -2.0));
  vec3 j = fetch(vec2(-1.0, 1.0)), k = fetch(vec2(1.0, 1.0));
  vec3 l = fetch(vec2(-1.0, -1.0)), m = fetch(vec2(1.0, -1.0));

  vec3 result = e * 0.125;
  result += (a + c + g + i) * 0.03125;
  result += (b + d + f + h) * 0.0625;
  result += (j + k + l + m) * 0.125;

  fragColor = vec4(result, 1.0);
}`

/** 9-tap tent upsample, accumulated additively back up the mip chain. */
export const BLOOM_UP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uRadius;

vec3 fetch(vec2 offset) {
  return texture(uSource, vUv + offset * uTexel * uRadius).rgb;
}

void main() {
  vec3 result = fetch(vec2(-1.0, 1.0)) * 1.0 + fetch(vec2(0.0, 1.0)) * 2.0 + fetch(vec2(1.0, 1.0)) * 1.0;
  result += fetch(vec2(-1.0, 0.0)) * 2.0 + fetch(vec2(0.0, 0.0)) * 4.0 + fetch(vec2(1.0, 0.0)) * 2.0;
  result += fetch(vec2(-1.0, -1.0)) * 1.0 + fetch(vec2(0.0, -1.0)) * 2.0 + fetch(vec2(1.0, -1.0)) * 1.0;

  fragColor = vec4(result / 16.0, 1.0);
}`

/**
 * Final composite: chromatic aberration, bloom, exposure, tonemap, grade,
 * vignette, grain, and an ordered dither on the way out.
 */
export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uBloomIntensity;
uniform float uAberration;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform bool uTonemap;

${COMMON}

// ACES filmic approximation (Krzysztof Narkowicz). Rolls highlights off instead
// of clipping them, which is the difference between bloom that looks like light
// and bloom that looks like a white blob.
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

/**
 * Hash without a sine (after Dave Hoskins).
 *
 * The usual fract(sin(dot(p, k)) * big) collapses once its argument gets
 * large: float32 cannot resolve the increments, argument reduction inside sin
 * throws away what is left, and the noise degenerates into bands and then into
 * a constant. Feeding it a millisecond timestamp reaches that point within
 * minutes, which is why grain would work on load and quietly die later.
 */
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 centred = vUv - 0.5;

  // Lateral chromatic aberration: the three channels are sampled at slightly
  // different magnifications, so the split grows towards the edges and stays
  // clean in the middle — the way a real lens misbehaves.
  vec3 scene;
  if (uAberration > 0.0) {
    float amount = uAberration * 0.01;
    scene.r = texture(uScene, 0.5 + centred * (1.0 - amount)).r;
    scene.g = texture(uScene, vUv).g;
    scene.b = texture(uScene, 0.5 + centred * (1.0 + amount)).b;
  }
  else {
    scene = texture(uScene, vUv).rgb;
  }

  vec3 colour = scene + texture(uBloom, vUv).rgb * uBloomIntensity;

  colour *= uExposure;
  if (uTonemap) colour = aces(colour);

  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  colour = mix(vec3(luma), colour, uSaturation);

  // Vignette in a corrected aspect so it stays circular on a 16:9 frame.
  vec2 vig = centred * vec2(uResolution.x / uResolution.y, 1.0);
  colour *= mix(1.0, smoothstep(1.05, 0.25, length(vig)), uVignette);

  colour = toSrgb(max(colour, 0.0));

  /*
   * Contrast as a symmetric S-curve in display space.
   *
   * It used to be a linear stretch about 0.5, applied before this conversion —
   * two mistakes compounding. A 0.5 pivot is far above the linear value of a
   * perceptual mid-grey (~0.21), and the plates this thing films are darker
   * again: most of a dark UI sits below 0.05 linear. So everything under
   * 0.5 - 0.5/contrast came out negative and was clamped to black. A contrast
   * of 1.45 did not add contrast to a dark shot, it deleted the shot.
   *
   * This curve is pinned at 0, 0.5 and 1, is monotonic, and cannot clip: dark
   * content gets darker relative to its neighbours instead of vanishing.
   */
  if (abs(uContrast - 1.0) > 1e-4) {
    vec3 c = clamp(colour, 0.0, 1.0);
    vec3 lo = pow(c, vec3(uContrast));
    vec3 hi = pow(1.0 - c, vec3(uContrast));
    colour = lo / max(lo + hi, vec3(1e-6));
  }

  if (uGrain > 0.0) {
    // Signed noise, so grain does not lift the blacks the way additive noise does.
    float noise = hash(vUv * uResolution + uTime * 977.0) - 0.5;
    colour += noise * uGrain;
  }

  // A sub-LSB dither. The near-black backdrops these shots use would otherwise
  // band into visible steps once the video codec quantises them.
  colour += (hash(vUv * uResolution + 17.0) - 0.5) / 255.0;

  fragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
}`

/**
 * A layer drawn flat on the finished frame.
 *
 * No ray, no plane, no circle of confusion: an overlay is deliberately outside
 * the camera. Something meant to read as applied to the video rather than
 * filmed with it — a watermark, a lower third — has to stay square and sharp
 * however the shot is angled.
 */
export const OVERLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uCentre;      // frame fractions, y up
uniform vec2 uHalfSize;    // frame fractions
uniform float uRotation;   // radians
uniform float uAspect;
uniform float uOpacity;

void main() {
  vec2 offset = vUv - uCentre;
  // Rotate in a square space, otherwise a 45° title shears with the frame.
  offset.x *= uAspect;
  float c = cos(uRotation), s = sin(uRotation);
  offset = mat2(c, -s, s, c) * offset;
  offset.x /= uAspect;

  vec2 uv = offset / (uHalfSize * 2.0) + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;

  vec4 texel = texture(uSource, uv);
  float alpha = texel.a * uOpacity;
  if (alpha < 0.004) discard;
  fragColor = vec4(texel.rgb * alpha, alpha);
}`

/**
 * Overlays and their glow, laid onto the finished frame.
 *
 * Bloom runs on the overlay by itself rather than on the frame beneath it, so a
 * title can glow without picking up the depth of field it was put outside the
 * camera to avoid. The premultiplied blend keeps its edges clean over whatever
 * it lands on.
 */
export const OVERLAY_COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uOverlay;
uniform sampler2D uBloom;
uniform float uBloomIntensity;

${COMMON}

void main() {
  vec4 overlay = texture(uOverlay, vUv);
  vec3 glow = texture(uBloom, vUv).rgb * uBloomIntensity;

  // Glow reaches past the art it came from, so it carries its own coverage
  // rather than being masked by the overlay's.
  float alpha = clamp(overlay.a + max(glow.r, max(glow.g, glow.b)), 0.0, 1.0);
  vec3 colour = toSrgb(max(overlay.rgb + glow, 0.0));

  if (alpha < 0.004) discard;
  fragColor = vec4(colour * alpha, alpha);
}`

/** Straight blit, used to present a target to the canvas. */
export const BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
void main() {
  fragColor = vec4(texture(uSource, vUv).rgb, 1.0);
}`
