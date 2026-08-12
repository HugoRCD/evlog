/**
 * GLSL for the Render labs pipeline.
 *
 * The chain is: stage (DOM plane in 3D) → DOF → bloom (down/up mip chain) →
 * composite (lens, tonemap, grade, vignette, grain) → stylize.
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
uniform vec2 uFocusTilt;      // how far that plane leans, per unit of ndc
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

          /*
           * Scheimpflug: the sharp plane leans, and the band leans with it.
           *
           * A sensor and a lens that are parallel can only ever hold a slab
           * parallel to both in focus. Tilt the element and the plane of
           * sharpness swings — which is why a tilted lens can hold a receding
           * surface sharp end to end, or cut a thin diagonal band across a
           * flat one and leave the rest soft. The second is the whole of the
           * look; the focus control alone can only slide a band that stays
           * square to the camera.
           *
           * Applied to the focal position rather than to the geometry, because
           * the plane is defined here in the same normalised span the focus
           * lives in — a linear lean across the frame is exactly a tilt of it.
           */
          float tilted = uFocus + dot(ndc, uFocusTilt);

          // Signed, so the DOF pass can tell near bokeh from far bokeh, and
          // saturating at ±1 so the band edge is where blur stops growing.
          coc = clamp((position - tilted) / max(uFocusRange, 1e-3), -1.0, 1.0) * uAperture;
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
uniform float uBlades;      // 0 for a disc, 3..9 for an iris
uniform float uCatEye;
uniform float uSwirl;
uniform float uSqueeze;

${COMMON}

const float GOLDEN_ANGLE = 2.39996323;
const float TAU = 6.28318530718;

/**
 * Push a unit-disc sample out to the edge of a regular polygon.
 *
 * A circular kernel is what every naive depth of field produces, and it is why
 * they all read as the same blur. A real iris is a polygon, and its corners are
 * the whole reason an out-of-focus highlight looks photographed.
 *
 * Normalised by the apothem so the polygon is inscribed in the unit disc, which
 * keeps the blur the width the radius says it is rather than widening it by the
 * ratio of circumradius to inradius.
 */
vec2 bladed(vec2 offset, float angle) {
  if (uBlades < 3.0) return offset;
  float segment = TAU / uBlades;
  return offset * (cos(segment * 0.5) / cos(mod(angle, segment) - segment * 0.5));
}

/**
 * Optical vignetting.
 *
 * The lens barrel occludes rays arriving off-axis, so a highlight away from the
 * middle of the frame is clipped between two circles and comes out as an almond
 * — the cat's eye. Squeezed along the radius and left alone across it, which is
 * the direction the tube actually cuts.
 */
vec2 catEye(vec2 offset, vec2 centred, float cornerRadius) {
  if (uCatEye <= 0.0) return offset;
  // Normalised against the corner, so full squeeze happens at the corner and
  // nowhere else. Against a fixed radius it saturated across most of the frame
  // and collapsed the kernel to a line everywhere but the middle — which is not
  // a cat's eye, it is a broken blur.
  float distance = clamp(length(centred) / cornerRadius, 0.0, 1.0);
  if (distance < 1e-4) return offset;

  vec2 direction = normalize(centred);
  float along = dot(offset, direction);
  vec2 across = offset - direction * along;
  return direction * along * (1.0 - uCatEye * distance * 0.6) + across;
}

/**
 * Petzval swirl.
 *
 * An uncorrected field curves, so away from the axis a bokeh disc is drawn as an
 * arc rather than a circle — stretched along the tangent, pinched along the
 * radius, and more of both the further out it sits. Read around a frame those
 * arcs form the whirlpool a Petzval lens is bought for.
 *
 * Anisotropy rather than rotation. Turning a symmetric disc changes nothing;
 * the swirl is the disc ceasing to be symmetric.
 */
vec2 swirled(vec2 offset, vec2 centred, float cornerRadius) {
  if (uSwirl <= 0.0) return offset;
  float distance = clamp(length(centred) / cornerRadius, 0.0, 1.0);
  if (distance < 1e-4) return offset;

  vec2 radial = normalize(centred);
  vec2 tangent = vec2(-radial.y, radial.x);
  return radial * dot(offset, radial) * (1.0 - uSwirl * distance * 0.55)
    + tangent * dot(offset, tangent) * (1.0 + uSwirl * distance * 0.95);
}

/**
 * The anamorphic oval.
 *
 * A squeezed front element gathers a wider field onto the same frame, so its
 * out-of-focus highlights come back as ovals standing on end — the companion to
 * the horizontal flare, and the half of the look that survives when nothing in
 * the shot is bright enough to streak.
 */
vec2 squeezed(vec2 offset) {
  return uSqueeze > 0.0 ? vec2(offset.x / (1.0 + uSqueeze), offset.y) : offset;
}

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
  // Corrected for the frame's shape, so the cat's eye opens along the real
  // radius rather than along a stretched one on a wide format.
  float aspect = uTexel.y / uTexel.x;
  vec2 centred = (vUv - 0.5) * vec2(aspect, 1.0);
  float cornerRadius = 0.5 * sqrt(aspect * aspect + 1.0);

  for (int i = 1; i < 256; i++) {
    if (i >= uSamples) break;
    float fi = float(i);
    // sqrt keeps the spiral area-uniform instead of clustering at the centre.
    float radius = sqrt(fi / count);
    float angle = fi * GOLDEN_ANGLE;
    // Shape, then aperture geometry, then field: the blade decides the outline,
    // the barrel clips it, and the curvature bends what is left.
    vec2 offset = swirled(
      catEye(squeezed(bladed(vec2(cos(angle), sin(angle)) * radius, angle)), centred, cornerRadius),
      centred,
      cornerRadius
    );

    vec2 uv = vUv + offset * centreRadius * uTexel;
    vec4 tap = texture(uSource, uv);
    float tapRadius = abs(unpackCoc(texture(uCocMap, uv).r)) * uMaxRadius;
    // Measured on the shaped offset, not on the spiral's own radius: the weight
    // test asks whether a tap can reach this pixel, and a blade or a cat's eye
    // has moved it somewhere else.
    float distance = length(offset) * centreRadius;

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
uniform float uBleed;

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

  // Veiling glare, which has no threshold: glass scatters a little of
  // everything, not only what is bright. A floor here rather than a second blur
  // chain — the mips are already the right diffusion, and the only thing
  // separating halation from bloom is what was allowed into them.
  fragColor = vec4(colour * max(contribution, uBleed), 1.0);
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

/**
 * One octave of an anamorphic streak.
 *
 * Run several times with the stride growing by a factor of the tap count, which
 * is what turns a handful of samples into a streak hundreds of pixels long: each
 * pass spreads what the last one already spread, so the reach multiplies where a
 * single wide kernel would only add.
 *
 * Horizontal only. The squeeze in an anamorphic lens is horizontal, so its
 * highlights flare along one axis and that asymmetry is the entire signature —
 * blurred in both directions it is just more bloom.
 */
export const STREAK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uStride;

void main() {
  vec3 sum = vec3(0.0);
  float weightSum = 0.0;

  for (int i = -4; i <= 4; i++) {
    float offset = float(i) * uStride;
    // Falls off with distance so the streak tapers instead of ending in a bar.
    float weight = exp(-abs(float(i)) * 0.45);
    sum += texture(uSource, vUv + vec2(offset * uTexel.x, 0.0)).rgb * weight;
    weightSum += weight;
  }

  fragColor = vec4(sum / weightSum, 1.0);
}`

/**
 * A star filter: the same smear as the streak, sent out along several axes.
 *
 * The glass has grooves etched into it, and every groove diffracts a highlight
 * into a line perpendicular to itself. Two crossed sets give the four-pointed
 * star everyone recognises; three give six. It is the one flare that survives
 * being pointed at a small light rather than a bright field, which is what makes
 * it read on a shot with nothing else going on.
 *
 * One pass over all the arms rather than a chain per arm: the reach here is a
 * few hundred pixels rather than the streak's thousand, so a straight weighted
 * walk is cheaper than compounding.
 */
export const STAR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uPoints;
uniform float uAngle;
uniform float uLength;

const float TAU = 6.28318530718;

void main() {
  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  int arms = int(uPoints);

  for (int a = 0; a < 8; a++) {
    if (a >= arms) break;
    float angle = uAngle + float(a) * TAU / float(arms);
    vec2 direction = vec2(cos(angle), sin(angle));

    for (int i = 1; i <= 12; i++) {
      float t = float(i) / 12.0;
      // Falls away along the arm, so it tapers to a point instead of ending.
      float weight = exp(-t * 2.6);
      sum += texture(uSource, vUv + direction * t * uLength * uTexel * 260.0).rgb * weight;
      weightSum += weight;
    }
  }

  fragColor = vec4(sum / max(weightSum, 1e-4), 1.0);
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
 * Final composite: lens, bloom, exposure, tonemap, grade, vignette,
 * grain, and an ordered dither on the way out.
 */
export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform vec2 uResolution;
uniform float uBloomIntensity;
uniform float uStreaks;
uniform sampler2D uStar;
uniform float uStarIntensity;
uniform float uGhosts;
uniform float uDiffusion;
uniform float uTanHalfFov;
uniform float uDistortion;
uniform float uAberration;
uniform float uDispersion;
uniform float uLensNoise;
uniform float uRadialBlur;
uniform float uSpinBlur;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uDuotone;
uniform vec3 uDuotoneShadow;
uniform vec3 uDuotoneHighlight;
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

/**
 * Where a fragment reads the frame, once the lens has had its way with it.
 *
 * The scale is the magnification for one wavelength: glass focuses short and long
 * wavelengths at slightly different sizes, and that difference is the whole of
 * lateral chromatic aberration. The bulge multiplies into the same coordinate
 * rather than being a second pass over the result, so the two compose the way
 * they do in a real lens instead of one distorting the other's output.
 */
vec2 lensUv(vec2 centred, float aspect, float scale) {
  vec2 radial = centred * vec2(aspect, 1.0);
  // Brown–Conrady, first term only. Subtracted, so a positive amount samples
  // nearer the middle at the edges and the picture bulges towards the viewer —
  // which is the direction anyone reaching for "fisheye" means.
  float bulge = 1.0 - uDistortion * dot(radial, radial);
  return 0.5 + centred * bulge * scale;
}

const int SPECTRAL_TAPS = 12;

/**
 * Steps along the camera's path during the exposure.
 *
 * Eight rather than more, because each one is itself a full lens sample — with
 * dispersion on, a tap is twelve reads of the frame. Eight is where the smear
 * stops showing its own steps on the ranges these controls allow.
 */
const int MOTION_TAPS = 8;

/**
 * Three overlapping responses standing in for a sensor's.
 *
 * Triangular rather than gaussian, and each channel is normalised by its own
 * total afterwards — so integrating a frame that had no fringe in it gives that
 * frame back, rather than a version of it tinted by whichever lobe happened to
 * carry more weight.
 */
vec3 spectralWeight(float t) {
  return max(vec3(0.0), 1.0 - abs(vec3(t) - vec3(0.15, 0.5, 0.85)) * 2.5);
}

vec3 sampleScene(vec2 centred, float aspect, float jitter) {
  float spread = uAberration * 0.01 * (1.0 + jitter);

  if (spread <= 0.0) return texture(uScene, lensUv(centred, aspect, 1.0)).rgb;

  if (uDispersion <= 0.0) {
    // One magnification per channel: the split grows towards the edges and
    // stays clean in the middle, the way a real lens misbehaves.
    return vec3(
      texture(uScene, lensUv(centred, aspect, 1.0 - spread)).r,
      texture(uScene, lensUv(centred, aspect, 1.0)).g,
      texture(uScene, lensUv(centred, aspect, 1.0 + spread)).b
    );
  }

  // Integrated across a band of wavelengths instead of read at three of them.
  // That is the difference between a fringe and a prism: the channels stop
  // being three places the frame is sampled and become three responses to a
  // continuum, so the split smears rather than banding.
  float band = spread * (1.0 + uDispersion * 3.0);
  vec3 sum = vec3(0.0);
  vec3 weightSum = vec3(0.0);
  for (int i = 0; i < SPECTRAL_TAPS; i++) {
    float t = (float(i) + 0.5) / float(SPECTRAL_TAPS);
    vec3 weight = spectralWeight(t);
    vec3 tap = texture(uScene, lensUv(centred, aspect, 1.0 + (t - 0.5) * 2.0 * band)).rgb;
    sum += tap * weight;
    weightSum += weight;
  }
  return sum / max(weightSum, vec3(1e-4));
}

/**
 * Internal reflections.
 *
 * Light that made it through the front element bounces back off the sensor and
 * again off a later surface, and arrives inverted through the optical axis. So
 * each ghost is the frame's bright parts thrown across the centre at its own
 * scale — which is why they march in a line through the middle of the shot and
 * not outward from the highlight that produced them.
 */
vec3 lensGhosts(vec2 uv) {
  vec3 sum = vec3(0.0);
  vec2 toCentre = 0.5 - uv;

  for (int i = 1; i <= 4; i++) {
    // Alternating sides of the centre, at scales that are not multiples of each
    // other — evenly spaced ghosts read as a repeating pattern rather than as
    // reflections off surfaces at different depths.
    float scale = 0.4 + float(i) * 0.63;
    if (i == 2 || i == 4) scale = -scale * 0.55;
    vec2 ghost = 0.5 + toCentre * scale;

    // The aperture stops these before they reach the edge of the frame.
    float falloff = 1.0 - clamp(length(ghost - 0.5) * 2.0, 0.0, 1.0);
    // Each surface has its own coating, so each ghost has its own cast.
    vec3 tint = 0.55 + 0.45 * cos(vec3(0.0, 2.1, 4.2) + float(i) * 1.3);
    sum += texture(uBloom, ghost).rgb * falloff * falloff * tint;
  }
  return sum;
}

void main() {
  vec2 centred = vUv - 0.5;
  float aspect = uResolution.x / uResolution.y;

  /*
   * Grain, scatter and the output dither are noise, and noise has to be measured
   * against the frame rather than against the buffer.
   *
   * Seeded from raw pixel coordinates, every one of them changes character with
   * the render size: the same shot previewed at 1920 and exported at 3840 gets
   * grain at half the relative size, and a grade judged on one is wrong for the
   * other. Referenced to a 1080-high frame — the same convention the bokeh radius
   * and the screen cell already use — the texture is a property of the shot.
   */
  vec2 grainUv = vUv * vec2(aspect * 1080.0, 1080.0);

  // Scattered rather than refracted: a jitter on the split breaks the fringe
  // into speckle, which is what stops a wide spread from reading as three flat
  // bands laid over the edge of the frame.
  float jitter = uLensNoise > 0.0
    ? (hash(grainUv + uTime * 331.0) - 0.5) * uLensNoise * 2.0
    : 0.0;

  /*
   * A zoom or a twist made during the exposure.
   *
   * Both are the same gesture — the frame sampled repeatedly along the path the
   * camera travelled while the shutter was open, and averaged. A zoom scales the
   * coordinate towards the middle, a twist turns it about the middle, and doing
   * both at once is what a lens does when it is racked and rotated together.
   *
   * Unlike the bokeh, this needs nothing in the shot to work on: it smears
   * whatever is there, so it reads on a flat panel as clearly as on a highlight.
   *
   * The rotation happens in a square space and comes back out of it, or a twist
   * would trace an ellipse on a wide frame instead of a circle.
   */
  vec3 scene;
  if (uRadialBlur > 0.0 || uSpinBlur > 0.0) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < MOTION_TAPS; i++) {
      float t = float(i) / float(MOTION_TAPS - 1);
      float scale = 1.0 - uRadialBlur * 0.3 * t;
      float turn = uSpinBlur * 0.4 * t;
      float c = cos(turn), sn = sin(turn);

      vec2 square = centred * vec2(aspect, 1.0);
      square = mat2(c, -sn, sn, c) * square * scale;
      sum += sampleScene(square / vec2(aspect, 1.0), aspect, jitter);
    }
    scene = sum / float(MOTION_TAPS);
  }
  else {
    scene = sampleScene(centred, aspect, jitter);
  }
  // The glow follows the geometry it came from. Sampled straight it would stay
  // put while the picture under it bent, and every highlight near an edge would
  // separate from the thing that was glowing.
  vec2 lensed = lensUv(centred, aspect, 1.0);
  vec3 colour = scene;

  colour += texture(uBloom, lensed).rgb * uBloomIntensity;
  if (uStreaks > 0.0) {
    // Cooler than the glow it came from: the coating on an anamorphic front
    // element is what produces the flare, and it is what makes it blue.
    colour += texture(uStreak, lensed).rgb * uStreaks * vec3(0.55, 0.75, 1.0);
  }
  if (uStarIntensity > 0.0) colour += texture(uStar, lensed).rgb * uStarIntensity;
  if (uGhosts > 0.0) colour += lensGhosts(lensed) * uGhosts;

  /*
   * A diffusion filter, and the reason it is a blend rather than an addition.
   *
   * Everything above adds light: the glow, the streak, the ghosts all leave the
   * picture where it was and put more on top. A net or a mist filter does the
   * opposite — it scatters the light already there, so a highlight loses as much
   * as its surroundings gain. What that costs is contrast, and what it buys is
   * the veil around every bright edge that reads as dreamy rather than as bright.
   *
   * Mixed towards the same blurred copy the glow is made of, which is why this
   * needs some glow to work with — and why it lifts the blacks nearest a
   * highlight and leaves the far corners alone, exactly as a real filter does.
   */
  if (uDiffusion > 0.0) {
    colour = mix(colour, texture(uBloom, lensed).rgb, uDiffusion * 0.65);
  }

  colour *= uExposure;
  if (uTonemap) colour = aces(colour);

  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));

  // Duotone before saturation, not after: this replaces the picture's hue with
  // a ramp, and saturation is then a control over how far that ramp is taken —
  // which is the one adjustment anyone wants once they have picked two colours.
  if (uDuotone > 0.0) {
    // The ramp already carries the brightness — a dark shadow colour and a
    // bright highlight one — so it replaces the picture rather than tinting it.
    // Multiplying by luma on top of that darkens everything twice and leaves a
    // duotone that only reads at the very top of the range.
    vec3 ramp = mix(uDuotoneShadow, uDuotoneHighlight, smoothstep(0.0, 1.0, luma));
    colour = mix(colour, ramp, uDuotone);
    luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  }

  colour = mix(vec3(luma), colour, uSaturation);

  /*
   * Natural illumination falloff, in a corrected aspect so it stays circular.
   *
   * cos⁴ of the angle a point subtends at the lens — the real law, rather than
   * the arbitrary smoothstep this used to be. Written as a rational function of
   * the tangent because that is what it reduces to and it avoids a trig call.
   *
   * Tying it to the field of view is the point: a wide lens darkens its corners
   * hard and a long one barely at all, so the vignette now tightens when the
   * lens is opened instead of staying the same ring at every focal length.
   */
  vec2 vig = centred * vec2(aspect, 1.0);
  float tangent = length(vig) * 2.0 * uTanHalfFov;
  float natural = 1.0 / ((1.0 + tangent * tangent) * (1.0 + tangent * tangent));
  colour *= mix(1.0, natural, uVignette);

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
    float noise = hash(grainUv + uTime * 977.0) - 0.5;
    colour += noise * uGrain;
  }

  // A sub-LSB dither. The near-black backdrops these shots use would otherwise
  // band into visible steps once the video codec quantises them.
  colour += (hash(grainUv + 17.0) - 0.5) / 255.0;

  fragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
}`

/**
 * The screen the scene is redrawn through.
 *
 * Everything here works in cells rather than in pixels, and reads the picture
 * once per cell rather than once per fragment — that is what makes it a screen
 * and not a filter. A dither that sampled every fragment would quantize detail
 * finer than its own grid and come out as noise; one that samples the cell
 * centre commits to a value and draws it.
 *
 * It runs *before* the light, not after the grade, and that ordering is the
 * whole look. A screen is a thing that emits — an LED panel, a tube, ink under a
 * lamp — so it belongs where the scene is, in front of the lens, with the glow
 * and the streak and the bokeh happening to it. Run last it was a filter laid
 * over a finished picture: the glyphs could not glow, nothing bled between
 * cells, and the result read as a texture stamped on the frame rather than as
 * something being filmed.
 *
 * The tone decisions are still taken in display space. Quantizing in linear
 * light puts every step in the highlights, where nobody can see them, and none
 * in the shadows, which is where the whole picture lives. So each cell is
 * converted, decided, and converted back — and anything that was brighter than
 * white keeps that headroom on the way out, or the panel would have nothing left
 * above the bloom threshold and could not light its own neighbours.
 */
export const STYLIZE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform sampler2D uGlyphs;
uniform vec2 uResolution;
uniform vec2 uCell;        // cell size in pixels; letter cells are taller than wide
uniform float uGlyphCount;
uniform float uGlyphGain;
uniform float uLevels;
uniform float uColour;
uniform float uAngle;      // radians
uniform float uMask;       // -1 shadows only, 0 everywhere, 1 highlights only
uniform int uMode;         // 1 dither, 2 ascii, 3 halftone, 4 posterize, 5 crt

${COMMON}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float TAU = 6.28318530718;

/**
 * How lit a cell is before anything is drawn in it.
 *
 * A panel's dark cells are not absent, they are unlit — the glyph is still
 * physically there catching whatever light is in the room, and it is what makes
 * the grid read as a surface across the black parts of a shot instead of the
 * picture simply stopping. Without it the darks go empty and the whole thing
 * looks like sparse noise on a void rather than like a screen.
 */
const float PANEL_FLOOR = 0.022;

/**
 * The 8×8 ordered dither matrix, built rather than tabulated.
 *
 * Bit reversal interleaved with x^y — the standard recursive construction,
 * which folds into a handful of integer ops. A 64-entry array would have to be
 * indexed by a value the compiler cannot see, and a dynamically indexed array
 * in a fragment shader becomes a branch tree on several drivers.
 */
float bayer8(vec2 cell) {
  ivec2 c = ivec2(cell) & 7;
  int a = c.x ^ c.y;
  int v = ((a >> 2) & 1)
    | (((c.y >> 2) & 1) << 1)
    | (((a >> 1) & 1) << 2)
    | (((c.y >> 1) & 1) << 3)
    | ((a & 1) << 4)
    | ((c.y & 1) << 5);
  return float(v) / 64.0;
}

/** The scene at the centre of a cell, in linear light, so a screen reads one value per cell. */
vec3 cellLinear(vec2 cell) {
  return max(texture(uSource, (cell + 0.5) * uCell / uResolution).rgb, 0.0);
}

/** What the screen draws with: brightness alone, or the colour it came in with. */
vec3 ink(vec3 c) {
  return mix(vec3(dot(c, LUMA)), c, uColour);
}

/**
 * How much of this cell the screen is allowed to draw.
 *
 * A screen over the whole frame is a filter; a screen that keeps to one band of
 * the tone is a material sitting inside a photograph — the glyphs live in the
 * glow and the rest of the picture is left alone. The band is soft on purpose:
 * a hard cut would trace the threshold as an outline, which reads as a mask
 * rather than as something the light is doing.
 */
float coverage(float luma) {
  if (uMask == 0.0) return 1.0;
  float amount = abs(uMask);
  // The threshold never quite reaches white, or the last of the travel would
  // turn the screen off entirely and the control would end in nothing.
  float threshold = amount * 0.92;
  float above = smoothstep(threshold - 0.2, threshold + 0.2, luma);
  return uMask > 0.0 ? above : 1.0 - above;
}

/** Whatever this cell had above white, kept so the panel can still light the room. */
float headroom(vec3 linear) {
  return max(1.0, max(linear.r, max(linear.g, linear.b)));
}

void main() {
  vec2 pixel = vUv * uResolution;
  float steps = max(uLevels - 1.0, 1.0);
  vec3 result;
  float boost = 1.0;
  // The tone the mask is judged on. Read per cell rather than per fragment, so
  // a cell is either drawn or not — sampled per fragment the band would cut
  // through the glyphs and leave half a character behind.
  float maskLuma = 0.0;
  /*
   * How much of its cell this fragment's mark actually covers.
   *
   * One for the screens that fill a cell outright, the glyph or dot coverage
   * for the two that draw a shape inside one. It only matters when the screen
   * is confined: replacing a whole frame, the gaps between glyphs are the black
   * an ascii rendering is made of. Laid into one band of a photograph, that same
   * black turns every cell into a dark box around its character — the picture
   * has to show through the gaps, not be punched out by them.
   */
  float inkCover = 1.0;

  if (uMode == 1) {
    vec2 cell = floor(pixel / uCell);
    vec3 linear = cellLinear(cell);
    boost = headroom(linear);
    vec3 c = ink(toSrgb(linear));
    maskLuma = dot(toSrgb(linear), LUMA);
    result = floor(c * steps + bayer8(cell)) / steps;
  }
  else if (uMode == 2) {
    vec2 cell = floor(pixel / uCell);
    vec2 inCell = fract(pixel / uCell);
    vec3 linear = cellLinear(cell);
    boost = headroom(linear);
    vec3 c = toSrgb(linear);
    float luma = clamp(dot(c, LUMA), 0.0, 1.0);
    maskLuma = luma;

    // Dithered before it is quantized to a glyph. Without it a slow gradient
    // lands on the same character across a wide band, and the picture reads as
    // contour lines rather than as tone.
    float offset = (bayer8(cell) - 0.5) / uGlyphCount;
    float index = floor(clamp(luma + offset, 0.0, 0.999) * uGlyphCount);
    // Held a little inside the cell, so the linear filter cannot drag the
    // neighbouring glyph in across the seam.
    float u = (index + clamp(inCell.x, 0.02, 0.98)) / uGlyphCount;

    /*
     * Re-sharpened after sampling.
     *
     * The atlas is rasterized far larger than a cell is drawn, so the filter is
     * minifying hard and every glyph comes back soft and grey-edged — which is
     * what made this read as smudge rather than as type. A hard threshold across
     * the coverage puts the edge back; smoothstep rather than step so it is
     * still antialiased at exactly the width of one sample.
     */
    float cover = smoothstep(0.35, 0.62, texture(uGlyphs, vec2(u, inCell.y)).a);
    inkCover = cover;
    // Divided by the ramp's gain because it is multiplied back by it below.
    // Ambient on a dark cell is a property of the panel, not of how dense the
    // glyphs happen to be — left un-divided, a sparse ramp with a 3x gain drew
    // its unlit grid three times brighter than a dense one and the texture
    // stopped reading as a surface and started reading as a screen door.
    result = (ink(c) + vec3(PANEL_FLOOR / uGlyphGain)) * cover;

    /*
     * The ramp's own density, paid in light rather than in display value.
     *
     * A letter covers a fraction of its cell where a block covers all of it, so
     * without this the same shot is dimmer drawn as type than drawn as blocks.
     * Folding it into the headroom instead of into the colour is what keeps the
     * hue: multiplied before the clamp, every lit cell simply saturated to white
     * and the picture came back monochrome.
     */
    boost *= uGlyphGain;
  }
  else if (uMode == 3) {
    float s = sin(uAngle), co = cos(uAngle);
    mat2 screen = mat2(co, -s, s, co);
    vec2 rotated = screen * pixel;
    vec2 cell = floor(rotated / uCell);
    vec2 inCell = fract(rotated / uCell) - 0.5;

    // Back out of the screen's own frame to read the picture where the dot sits.
    vec3 linear = max(texture(uSource, (transpose(screen) * ((cell + 0.5) * uCell)) / uResolution).rgb, 0.0);
    boost = headroom(linear);
    vec3 c = toSrgb(linear);
    float luma = clamp(dot(c, LUMA), 0.0, 1.0);
    maskLuma = luma;

    // Area proportional to brightness, hence the square root. A radius that
    // tracked brightness directly would put a mid grey at a quarter of its
    // coverage and darken every midtone in the frame.
    float radius = sqrt(luma) * 0.71;
    float edge = 0.7071 / min(uCell.x, uCell.y);
    float dotCover = 1.0 - smoothstep(radius - edge, radius + edge, length(inCell));
    inkCover = dotCover;
    result = ink(c) * dotCover;
  }
  else if (uMode == 4) {
    vec3 linear = cellLinear(floor(pixel / uCell));
    boost = headroom(linear);
    vec3 c = ink(toSrgb(linear));
    maskLuma = dot(toSrgb(linear), LUMA);
    result = floor(c * steps + 0.5) / steps;
  }
  else {
    vec3 linear = max(texture(uSource, vUv).rgb, 0.0);
    boost = headroom(linear);
    vec3 c = ink(toSrgb(linear));
    maskLuma = dot(toSrgb(linear), LUMA);
    float scan = 0.5 + 0.5 * cos(TAU * pixel.y / uCell.y);
    // An aperture grille: each cell split into three vertical stripes, which is
    // where a tube's colour comes from in the first place.
    float stripe = mod(floor(pixel.x * 3.0 / uCell.x), 3.0);
    vec3 mask = vec3(
      stripe < 0.5 ? 1.0 : 0.35,
      abs(stripe - 1.0) < 0.5 ? 1.0 : 0.35,
      stripe > 1.5 ? 1.0 : 0.35
    );
    // The mask and the scanline together throw away most of the light. Putting
    // it back is what keeps a crt shot from arriving two stops under; the
    // highlights clip in the process, which is also what a tube does.
    result = c * mask * mix(1.0, scan, 0.5) * 2.35;
  }

  // Back to linear, carrying whatever the cell had above white. Everything
  // downstream — the glow, the streak, the lens, the grade — is expecting light,
  // and a screen that clipped itself at 1.0 here would be a panel that cannot
  // illuminate anything, including its own neighbouring cells.
  vec3 screened = toLinear(clamp(result, 0.0, 1.0)) * boost;

  // Blended against this fragment's own scene rather than the cell's, so the
  // part the screen was kept out of holds every bit of detail it arrived with.
  vec3 plain = max(texture(uSource, vUv).rgb, 0.0);

  // Confined, the screen is a material laid onto a photograph and only its marks
  // belong there. Unconfined it replaces the frame outright, gaps included,
  // which is what makes an ascii rendering a rendering rather than an overlay.
  float blend = coverage(maskLuma);
  if (uMask != 0.0) blend *= inkCover;

  fragColor = vec4(mix(plain, screened, blend), 1.0);
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
