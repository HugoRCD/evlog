import { colors, isBrowser, isDev } from '../utils'

/** @internal Server-only snippet reader registered by Nitro plugin or initLogger. */
type SnippetReader = (file: string, line: number, contextLines?: number) => CodeSnippetLine[] | null

let snippetReader: SnippetReader | null = null

/**
 * Register a disk-backed snippet reader (Node.js integrations only).
 * @internal
 */
export function registerPrettyErrorSnippetReader(reader: SnippetReader | null): void {
  snippetReader = reader
}

/** Tree-only breathing line (connector without content). */
export const PRETTY_ERROR_TREE_SPACER = '__EVLOG_TREE_SPACER__'

function pushTreeSpacer(children: string[]) {
  children.push(PRETTY_ERROR_TREE_SPACER)
}

/** Pretty-print tree node for error sections. */
export interface PrettyErrorTreeEntry {
  key: string
  value: string
  /** Optional ANSI color for the value (server only). */
  valueColor?: string
  children?: string[]
}

/** Normalized error fields extracted from wide-event `error` context. */
export interface NormalizedErrorContext {
  message: string
  name?: string
  code?: string
  why?: string
  fix?: string
  link?: string
  status?: number
  stack?: string
  cause?: string
}

/** Parsed V8 stack frame. */
export interface StackFrame {
  raw: string
  file?: string
  line?: number
  column?: number
  fn?: string
  /** True for application source (not node_modules / build output). */
  isApp: boolean
}

/** Options for {@link buildErrorEntries}. */
export interface PrettyErrorOptions {
  /** Dev-only code snippets around the primary stack frame. @default true in dev */
  prettyErrorFrames?: boolean
  /** Max stack frames shown after the snippet. @default 2 when compact, else 3 */
  prettyErrorStackDepth?: number
  /** Tighter dev error layout: shorter snippet, no blank lines within the block. @default true in dev */
  compact?: boolean
  /** Project root for relative paths in snippets. @default process.cwd() */
  cwd?: string
}

export interface CodeSnippetLine {
  line: number
  content: string
  isErrorLine: boolean
}

const SKIP_PATH_RE = /(?:^|[/\\])(?:node_modules|\.nuxt|\.output)(?:[/\\]|$)/
const SKIP_FRAME_PATH_RE = /(?:^|[/\\])(?:packages[/\\]evlog|evlog[/\\]dist|evlog[/\\]src)(?:[/\\]|$)|[/\\]error\.(?:ts|mjs)(?:$|:)/
const SKIP_FRAME_FN_RE = /^(?:createError|EvlogError|new EvlogError)$/

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key]
  return typeof val === 'string' && val.length > 0 ? val : undefined
}

function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const val = obj[key]
  return typeof val === 'number' ? val : undefined
}

function extractGuidance(data: Record<string, unknown>): Pick<NormalizedErrorContext, 'code' | 'why' | 'fix' | 'link'> {
  return {
    code: pickString(data, 'code'),
    why: pickString(data, 'why'),
    fix: pickString(data, 'fix'),
    link: pickString(data, 'link'),
  }
}

/**
 * Extract structured error fields from a wide-event `error` value.
 */
export function normalizeErrorContext(error: unknown): NormalizedErrorContext | null {
  if (error === null || error === undefined) return null

  if (typeof error === 'string') {
    return { message: error }
  }

  if (!isPlainObject(error)) {
    return { message: String(error) }
  }

  const message = pickString(error, 'message')
    ?? pickString(error, 'statusText')
    ?? pickString(error, 'statusMessage')
    ?? 'Unknown error'

  const result: NormalizedErrorContext = {
    message,
    name: pickString(error, 'name'),
    code: pickString(error, 'code'),
    why: pickString(error, 'why'),
    fix: pickString(error, 'fix'),
    link: pickString(error, 'link'),
    status: pickNumber(error, 'status') ?? pickNumber(error, 'statusCode'),
    stack: pickString(error, 'stack'),
  }

  const { data, cause } = error
  if (isPlainObject(data)) {
    const guidance = extractGuidance(data)
    if (!result.code) result.code = guidance.code
    if (!result.why) result.why = guidance.why
    if (!result.fix) result.fix = guidance.fix
    if (!result.link) result.link = guidance.link
  }

  if (cause instanceof Error) {
    result.cause = cause.message
  } else if (isPlainObject(cause) && pickString(cause, 'message')) {
    result.cause = pickString(cause, 'message')
  }

  return result
}

/** Decode a `file://` URL or path for display and snippet lookup. */
export function decodeFileUrl(file: string): string {
  if (file.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(file).pathname)
    } catch {
      return file.slice('file://'.length)
    }
  }
  return file
}

function isAppPath(file: string): boolean {
  const normalized = file.replace(/\\/g, '/')
  if (SKIP_PATH_RE.test(normalized)) return false
  if (normalized.includes('/node_modules/')) return false
  return true
}

function formatDisplayPath(file: string, cwd: string): string {
  const decoded = decodeFileUrl(file).replace(/\\/g, '/')
  const cwdNorm = cwd.replace(/\\/g, '/').replace(/\/$/, '')
  if (cwdNorm && decoded.startsWith(`${cwdNorm}/`)) {
    const rel = decoded.slice(cwdNorm.length + 1)
    return rel.startsWith('./') ? rel.slice(2) : rel
  }
  const serverIdx = decoded.indexOf('/server/')
  if (serverIdx >= 0) return decoded.slice(serverIdx + 1)
  const srcIdx = decoded.indexOf('/src/')
  if (srcIdx >= 0) return decoded.slice(srcIdx + 1)
  return decoded
}

/**
 * Parse a V8 stack trace string into frames.
 */
export function parseStackFrames(stack: string | undefined): StackFrame[] {
  if (!stack) return []

  const lines = stack.split('\n')
  const frames: StackFrame[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('at ')) continue

    const withFn = trimmed.match(/^at (.+?) \((.+):(\d+):(\d+)\)$/)
    if (withFn) {
      const [, fn, file, lineStr, colStr] = withFn
      frames.push({
        raw: trimmed,
        fn,
        file,
        line: Number(lineStr),
        column: Number(colStr),
        isApp: isAppPath(file!),
      })
      continue
    }

    const withoutFn = trimmed.match(/^at (.+):(\d+):(\d+)$/)
    if (withoutFn) {
      const [, file, lineStr, colStr] = withoutFn
      frames.push({
        raw: trimmed,
        file,
        line: Number(lineStr),
        column: Number(colStr),
        isApp: isAppPath(file!),
      })
      continue
    }

    const asyncFn = trimmed.match(/^at async (.+?) \((.+):(\d+):(\d+)\)$/)
    if (asyncFn) {
      const [, fn, file, lineStr, colStr] = asyncFn
      frames.push({
        raw: trimmed,
        fn: `async ${fn}`,
        file,
        line: Number(lineStr),
        column: Number(colStr),
        isApp: isAppPath(file!),
      })
    }
  }

  return frames
}

function isInternalErrorFrame(frame: StackFrame): boolean {
  if (frame.fn) {
    const fn = frame.fn.replace(/^async /, '')
    if (SKIP_FRAME_FN_RE.test(fn)) return true
  }
  if (!frame.file) return true
  const path = decodeFileUrl(frame.file).replace(/\\/g, '/')
  if (SKIP_FRAME_PATH_RE.test(path)) return true
  if (path.includes('.nuxt/')) return true
  return false
}

/**
 * Pick the most useful frame for code snippets (prefer app source over bundles).
 */
export function pickPrimaryFrame(frames: StackFrame[]): StackFrame | undefined {
  const appFrames = frames.filter(f => f.isApp && f.file && f.line && !isInternalErrorFrame(f))
  if (appFrames.length === 0) return undefined

  const scored = appFrames.map((frame) => {
    const path = decodeFileUrl(frame.file!).replace(/\\/g, '/')
    let score = 0
    if (path.includes('/server/')) score += 8
    if (/\.(?:ts|tsx|vue)$/.test(path)) score += 6
    if (path.includes('/src/')) score += 3
    if (path.startsWith('./')) score += 2
    if (/\.(?:js|jsx|mjs)$/.test(path)) score += 1
    if (path.includes('.nuxt/')) score -= 20
    if (path.includes('/packages/evlog/')) score -= 20
    return { frame, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.frame ?? appFrames[0]
}

/**
 * Read source lines around a stack frame when a server snippet reader is registered.
 */
export function readCodeSnippet(
  file: string,
  line: number,
  contextLines = 2,
): CodeSnippetLine[] | null {
  if (!isDev() || isBrowser() || !snippetReader) return null
  return snippetReader(file, line, contextLines)
}

function formatSnippetLines(snippet: CodeSnippetLine[]): string[] {
  const width = String(snippet[snippet.length - 1]?.line ?? 0).length
  return snippet.map(({ line, content, isErrorLine }) => {
    const marker = isErrorLine ? `${colors.red}❯${colors.reset}` : `${colors.dim} ${colors.reset}`
    const numColor = isErrorLine ? colors.red : colors.gray
    const trimmed = content.length > 120 ? `${content.slice(0, 117)}…` : content
    return `${marker} ${numColor}${String(line).padStart(width, ' ')}${colors.reset} ${colors.dim}┃${colors.reset} ${colors.dim}${trimmed}${colors.reset}`
  })
}

function formatFrameLocation(frame: StackFrame, cwd: string): string {
  const file = frame.file ? formatDisplayPath(frame.file, cwd) : 'unknown'
  const loc = frame.line ? `${file}:${frame.line}` : file
  return frame.fn ? `at ${frame.fn} (${loc})` : `at ${loc}`
}

function formatCollapsedFrame(frame: StackFrame, cwd: string): string {
  const file = frame.file ? formatDisplayPath(frame.file, cwd) : 'unknown'
  const loc = frame.line ? `${file}:${frame.line}` : file
  const prefix = frame.fn?.startsWith('async') ? 'at async ' : 'at '
  const fn = frame.fn?.replace(/^async /, '') ?? loc
  if (frame.fn && frame.fn !== loc) {
    return `${prefix}${fn} (${loc})`
  }
  return `${prefix}${loc}`
}

const GUIDANCE_WRAP_WIDTH = 76
const GUIDANCE_CONTINUATION = '     '

/** Wrap guidance text with hanging indent for long Why/Fix lines. */
function formatGuidanceLine(label: string, text: string, labelColor: string): string[] {
  const prefix = `${labelColor}${label}:${colors.reset} `
  const lines: string[] = []
  let remaining = text.trim()
  let first = true

  while (remaining.length > 0) {
    const budget = first
      ? Math.max(24, GUIDANCE_WRAP_WIDTH - prefix.length)
      : Math.max(24, GUIDANCE_WRAP_WIDTH - GUIDANCE_CONTINUATION.length)
    if (remaining.length <= budget) {
      lines.push(first ? `${prefix}${remaining}` : `${GUIDANCE_CONTINUATION}${remaining}`)
      break
    }
    let split = remaining.lastIndexOf(' ', budget)
    if (split <= 0) split = budget
    const chunk = remaining.slice(0, split).trimEnd()
    lines.push(first ? `${prefix}${chunk}` : `${GUIDANCE_CONTINUATION}${chunk}`)
    remaining = remaining.slice(split).trimStart()
    first = false
  }

  return lines
}

/**
 * Build pretty-print tree entries for a wide-event `error` field.
 */
export function buildErrorEntries(
  error: unknown,
  options: PrettyErrorOptions = {},
): PrettyErrorTreeEntry[] {
  const normalized = normalizeErrorContext(error)
  if (!normalized) return []

  const cwd = options.cwd ?? (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '.')
  const compact = options.compact ?? isDev()
  const showFrames = !isBrowser() && (options.prettyErrorFrames ?? isDev())
  const stackDepth = options.prettyErrorStackDepth ?? (compact ? 2 : 3)
  const snippetContextLines = compact ? 1 : 2

  const children: string[] = []
  const frames = parseStackFrames(normalized.stack)
  const primary = pickPrimaryFrame(frames)

  if (primary?.file && primary.line) {
    pushTreeSpacer(children)
    if (showFrames) {
      const snippet = readCodeSnippet(primary.file, primary.line, snippetContextLines)
      children.push(`${colors.dim}   ${formatFrameLocation(primary, cwd)}${colors.reset}`)
      if (snippet) {
        children.push(...formatSnippetLines(snippet))
      }
    } else {
      children.push(`${colors.dim}   ${formatFrameLocation(primary, cwd)}${colors.reset}`)
    }
  }

  if (normalized.code) {
    children.push(`${colors.dim}Code:${colors.reset} ${normalized.code}`)
  }

  const hasGuidance = Boolean(normalized.why || normalized.fix || normalized.link)
  if (hasGuidance) {
    pushTreeSpacer(children)
  }

  if (normalized.why) {
    children.push(...formatGuidanceLine('Why', normalized.why, colors.yellow))
  }
  if (normalized.fix) {
    children.push(...formatGuidanceLine('Fix', normalized.fix, colors.cyan))
  }
  if (normalized.link) {
    children.push(`${colors.dim}More:${colors.reset} ${normalized.link}`)
  }

  if (normalized.cause && normalized.cause !== normalized.message) {
    children.push(`${colors.dim}Caused by:${colors.reset} ${normalized.cause}`)
  }

  const hiddenCount = frames.filter(f => !f.isApp || isInternalErrorFrame(f)).length
  const tailFrames = stackDepth > 0
    ? frames.filter(f => f !== primary && !isInternalErrorFrame(f)).slice(0, stackDepth)
    : []

  if (hiddenCount > 0 || tailFrames.length > 0) {
    pushTreeSpacer(children)
    if (hiddenCount > 0) {
      children.push(`${colors.gray}stack (${hiddenCount} frame${hiddenCount === 1 ? '' : 's'} hidden in node_modules)${colors.reset}`)
    } else {
      children.push(`${colors.gray}stack${colors.reset}`)
    }
    for (const frame of tailFrames) {
      children.push(`${colors.gray}  ${formatCollapsedFrame(frame, cwd)}${colors.reset}`)
    }
  }

  return [
    {
      key: 'error',
      value: `${colors.red}${colors.bold}${normalized.message}${colors.reset}`,
      children: children.length > 0 ? children : undefined,
    },
  ]
}
