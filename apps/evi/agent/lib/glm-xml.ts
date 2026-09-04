/**
 * GLM 4.5+ / 5.x native tool calls are XML in the text stream:
 * `<tool_call>{name}<arg_key>k</arg_key><arg_value>v</arg_value>...</tool_call>`.
 * Some Gateway deployments parse that into tool-call parts; others leave it in
 * `content` with `finish_reason: stop`, which Slack then posts as the reply.
 */

export interface GlmXmlCall {
  readonly name: string
  readonly args: Record<string, unknown>
}

export interface GlmXmlExtraction {
  readonly text: string
  readonly calls: readonly GlmXmlCall[]
}

const TOOL_CALL_BLOCK = /<tool_call>([\s\S]*?)<\/tool_call>/g
const ARG_PAIR = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g
const GLM_TAG = /<\/?(?:tool_call|arg_key|arg_value)\b/

/** GLM 4.5+ and 5.x share this XML tool protocol. */
export function usesGlmXmlProtocol(modelId: string): boolean {
  return /glm/i.test(modelId)
}

export function extractGlmXml(raw: string): GlmXmlExtraction {
  const calls: GlmXmlCall[] = []
  const withoutBlocks = raw.replace(TOOL_CALL_BLOCK, (_block, body: string) => {
    const call = parseToolCallBody(body)
    if (call) calls.push(call)
    return ''
  })
  return { text: stripGlmMarkup(withoutBlocks), calls }
}

function parseToolCallBody(body: string): GlmXmlCall | null {
  const nameMatch = body.match(/^\s*([^\s<]+)/)
  if (!nameMatch) return null
  const args: Record<string, unknown> = {}
  for (const match of body.matchAll(new RegExp(ARG_PAIR.source, 'g'))) {
    args[match[1]!] = parseArgValue(match[2]!)
  }
  return { name: nameMatch[1]!, args }
}

function parseArgValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return raw
    }
  }
  return raw
}

/** Drop leftover GLM tags and anything after the first one, including Slack-eaten fragments. */
export function stripGlmMarkup(text: string): string {
  const idx = text.search(GLM_TAG)
  const cut = idx === -1 ? text : text.slice(0, idx)
  return cut.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
