/**
 * Minimal WebGL2 helpers for Render labs.
 *
 * Everything the pipeline needs and nothing else: shader compilation with
 * readable errors, ping-pongable float render targets, and a fullscreen triangle.
 * No dependency — the lab is a single client-only route, and pulling a scene
 * graph in for one textured quad would cost more than it saves.
 */

/** A render target: one or more textures + framebuffer, resizable in place. */
export interface Target {
  /** First attachment. Most passes have exactly one. */
  texture: WebGLTexture
  textures: WebGLTexture[]
  framebuffer: WebGLFramebuffer
  width: number
  height: number
  resize: (width: number, height: number) => void
  dispose: () => void
}

export interface Program {
  program: WebGLProgram
  /**
   * Set a uniform by name. Type is inferred from the value: number → 1f,
   * boolean → 1i, array of 2/3/4 → vecN, array of 16 → mat4, WebGLTexture →
   * bound to the next free texture unit.
   */
  set: (name: string, value: UniformValue) => void
  use: () => void
  dispose: () => void
}

export type UniformValue = number | boolean | number[] | Float32Array | WebGLTexture

/**
 * A fullscreen triangle rather than a quad: one primitive instead of two, no
 * diagonal seam where the two triangles meet, and fewer redundant fragment
 * invocations along it. Vertices are generated from `gl_VertexID`, so there is
 * no vertex buffer at all.
 */
const FULLSCREEN_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`

export class Renderer {
  readonly gl: WebGL2RenderingContext
  /** True when RGBA16F targets are renderable — the pipeline drops to 8-bit otherwise. */
  readonly floatTargets: boolean

  private vao: WebGLVertexArrayObject
  private unit = 0
  /** Anisotropic filtering, when the driver exposes it. */
  private anisotropy: { pname: number, max: number } | null = null

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      // Needed for `canvas.toDataURL()` / `captureStream()` to see the last frame
      // without forcing a redraw right before the read.
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    })
    if (!gl) throw new Error('WebGL2 is not available in this browser.')
    this.gl = gl

    this.floatTargets = Boolean(
      gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'),
    )
    gl.getExtension('OES_texture_float_linear')

    const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
    if (aniso) {
      this.anisotropy = {
        pname: aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        max: gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number,
      }
    }

    // Empty VAO — the fullscreen triangle needs no attributes, but WebGL2 still
    // requires a bound VAO to draw.
    const vao = gl.createVertexArray()
    if (!vao) throw new Error('Failed to allocate a vertex array.')
    this.vao = vao

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
  }

  /** Compile a fragment shader against the shared fullscreen vertex shader. */
  fragment(source: string, label: string): Program {
    return this.program(FULLSCREEN_VERT, source, label)
  }

  program(vertexSource: string, fragmentSource: string, label: string): Program {
    const { gl } = this
    const vert = this.compile(gl.VERTEX_SHADER, vertexSource, `${label}:vert`)
    const frag = this.compile(gl.FRAGMENT_SHADER, fragmentSource, `${label}:frag`)

    const program = gl.createProgram()
    if (!program) throw new Error(`Failed to allocate program ${label}.`)
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    // Shaders are reference-counted by the program; detaching lets the driver
    // free the compiled objects as soon as the link is done.
    gl.detachShader(program, vert)
    gl.detachShader(program, frag)
    gl.deleteShader(vert)
    gl.deleteShader(frag)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Link failed for ${label}: ${log}`)
    }

    const locations = new Map<string, WebGLUniformLocation | null>()
    const location = (name: string) => {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name))
      return locations.get(name) ?? null
    }

    // Record each uniform's declared type.
    //
    // GLSL is strict about this: pushing a float into an `int` uniform raises
    // INVALID_OPERATION and leaves the uniform at zero, silently — no exception,
    // no visible error, just a shader reading a value nobody set. Dispatching on
    // the real type is the only way to make `set` safe for anything but floats.
    const types = new Map<string, number>()
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let index = 0; index < uniformCount; index++) {
      const info = gl.getActiveUniform(program, index)
      // Array uniforms are reported as `name[0]`.
      if (info) types.set(info.name.replace(/\[0\]$/, ''), info.type)
    }

    const INTEGER_TYPES = new Set<number>([
      gl.INT,
      gl.BOOL,
      gl.SAMPLER_2D,
      gl.SAMPLER_CUBE,
      gl.SAMPLER_3D,
      gl.SAMPLER_2D_ARRAY,
    ])

    return {
      program,
      use: () => {
        gl.useProgram(program)
        this.unit = 0
      },
      set: (name, value) => {
        const loc = location(name)
        // Unused uniforms get optimized out by the compiler — a missing location
        // is normal, not an error.
        if (loc === null) return
        if (typeof value === 'number') {
          if (INTEGER_TYPES.has(types.get(name) ?? gl.FLOAT)) gl.uniform1i(loc, Math.round(value))
          else gl.uniform1f(loc, value)
        } else if (typeof value === 'boolean') gl.uniform1i(loc, value ? 1 : 0)
        else if (value instanceof WebGLTexture) {
          const unit = this.unit++
          gl.activeTexture(gl.TEXTURE0 + unit)
          gl.bindTexture(gl.TEXTURE_2D, value)
          gl.uniform1i(loc, unit)
        } else if (value.length === 2) gl.uniform2fv(loc, value)
        else if (value.length === 3) gl.uniform3fv(loc, value)
        else if (value.length === 4) gl.uniform4fv(loc, value)
        else if (value.length === 16) gl.uniformMatrix4fv(loc, false, value)
        else throw new Error(`Unsupported uniform length ${value.length} for ${name}.`)
      },
      dispose: () => gl.deleteProgram(program),
    }
  }

  private compile(type: number, source: string, label: string): WebGLShader {
    const { gl } = this
    const shader = gl.createShader(type)
    if (!shader) throw new Error(`Failed to allocate shader ${label}.`)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? ''
      gl.deleteShader(shader)
      // Prefix each line so the compiler's `ERROR: 0:42` points at something
      // findable in a devtools console.
      const numbered = source.split('\n').map((line, i) => `${String(i + 1).padStart(3)} | ${line}`).join('\n')
      throw new Error(`Compile failed for ${label}: ${log}\n${numbered}`)
    }
    return shader
  }

  /**
   * `attachments` above one gives the pass several outputs.
   *
   * The scene needs two: colour blended by coverage, and the circle of confusion
   * kept apart from it. Packing depth into the colour's alpha means the blend
   * equation reads a focus distance as an opacity, and planes let the background
   * through in proportion to how blurred they are.
   */
  createTarget(
    width: number,
    height: number,
    options: { float?: boolean, linear?: boolean, attachments?: number } = {},
  ): Target {
    const { gl } = this
    const float = options.float !== false && this.floatTargets
    const filter = options.linear === false ? gl.NEAREST : gl.LINEAR
    const count = Math.max(1, options.attachments ?? 1)

    const textures = Array.from({ length: count }, () => {
      const created = gl.createTexture()
      if (!created) throw new Error('Failed to allocate a render target texture.')
      return created
    })
    const framebuffer = gl.createFramebuffer()
    if (!framebuffer) throw new Error('Failed to allocate a render target.')

    const allocate = (w: number, h: number) => {
      for (const texture of textures) {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          float ? gl.RGBA16F : gl.RGBA8,
          Math.max(1, Math.floor(w)),
          Math.max(1, Math.floor(h)),
          0,
          gl.RGBA,
          float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
          null,
        )
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
        // Clamping matters for every blur pass: wrapping would drag the opposite
        // edge of the frame into the bokeh and bloom kernels.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      }
    }

    allocate(width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    textures.forEach((texture, index) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture, 0)
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    const target: Target = {
      texture: textures[0]!,
      textures,
      framebuffer,
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
      resize: (w, h) => {
        const nw = Math.max(1, Math.floor(w))
        const nh = Math.max(1, Math.floor(h))
        if (nw === target.width && nh === target.height) return
        target.width = nw
        target.height = nh
        allocate(nw, nh)
      },
      dispose: () => {
        for (const texture of textures) gl.deleteTexture(texture)
        gl.deleteFramebuffer(framebuffer)
      },
    }
    return target
  }

  /**
   * Create a texture fed from a DOM source (the serialized stage image).
   *
   * `mipmap` is off for anything sampled at its own scale rather than through a
   * camera — the glyph atlas being the one such source. Its cells sit edge to
   * edge in a single row, so a lower mip is a blend of neighbouring characters,
   * and every glyph in the ramp bleeds into the two beside it.
   */
  createSourceTexture(mipmap = true): WebGLTexture {
    const { gl } = this
    const texture = gl.createTexture()
    if (!texture) throw new Error('Failed to allocate a source texture.')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // A tilted plane minifies hard towards its far edge — several texels per
    // pixel. Plain bilinear picks one of them and thin text crawls and sparkles
    // as the animation moves. Mipmaps fix the aliasing but blur that edge into
    // mush, because the minification is anisotropic: heavy along the direction
    // of recession, light across it. Anisotropic filtering is what keeps the
    // far edge both stable and legible.
    if (mipmap) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      if (this.anisotropy) {
        gl.texParameterf(gl.TEXTURE_2D, this.anisotropy.pname, this.anisotropy.max)
      }
    }
    return texture
  }

  upload(texture: WebGLTexture, source: TexImageSource, mipmap = true) {
    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    // WebGL2 allows mipmaps on non-power-of-two textures, so the plate can keep
    // the stage's exact dimensions instead of being padded to a power of two.
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D)
  }

  /** Bind a target (or the canvas when `null`) and set the viewport to match. */
  bind(target: Target | null) {
    const { gl } = this
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
      // Every attachment has to be listed or only the first one is written.
      if (target.textures.length > 1) {
        gl.drawBuffers(target.textures.map((_, index) => gl.COLOR_ATTACHMENT0 + index))
      }
      gl.viewport(0, 0, target.width, target.height)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  /** Draw the fullscreen triangle with whatever program is currently bound. */
  draw() {
    const { gl } = this
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  clear(r = 0, g = 0, b = 0, a = 1) {
    const { gl } = this
    gl.clearColor(r, g, b, a)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  /** Clear one attachment of a multi-target pass to its own value. */
  clearAttachment(index: number, values: [number, number, number, number]) {
    this.gl.clearBufferfv(this.gl.COLOR, index, new Float32Array(values))
  }

  dispose() {
    this.gl.deleteVertexArray(this.vao)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
