import { gateway, wrapLanguageModel } from 'ai'
import type { LanguageModelMiddleware } from 'ai'
import type { LanguageModelV4Content, LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { extractGlmXml } from './glm-xml'

let callSeq = 0

function nextToolCallId(): string {
  callSeq += 1
  return `glmxml_${callSeq.toString(36)}`
}

function asToolCallPart(name: string, args: Record<string, unknown>): LanguageModelV4Content {
  return {
    type: 'tool-call',
    toolCallId: nextToolCallId(),
    toolName: name,
    input: JSON.stringify(args),
  }
}

export function recoverGlmXmlContent(content: LanguageModelV4Content[]): {
  content: LanguageModelV4Content[]
  recovered: number
} {
  const out: LanguageModelV4Content[] = []
  let recovered = 0
  for (const part of content) {
    if (part.type !== 'text') {
      out.push(part)
      continue
    }
    const { text, calls } = extractGlmXml(part.text)
    if (text) out.push({ ...part, text })
    for (const call of calls) {
      recovered += 1
      out.push(asToolCallPart(call.name, call.args))
    }
  }
  return { content: out, recovered }
}

export function rewriteGlmXmlStream(chunks: LanguageModelV4StreamPart[]): LanguageModelV4StreamPart[] {
  const texts: string[] = []
  const passthrough: LanguageModelV4StreamPart[] = []
  let finish: Extract<LanguageModelV4StreamPart, { type: 'finish' }> | undefined
  let textId = 'glmxml-text'

  for (const chunk of chunks) {
    if (chunk.type === 'text-start') {
      textId = chunk.id
      continue
    }
    if (chunk.type === 'text-delta') {
      texts.push(chunk.delta)
      continue
    }
    if (chunk.type === 'text-end') continue
    if (chunk.type === 'finish') {
      finish = chunk
      continue
    }
    passthrough.push(chunk)
  }

  const { text, calls } = extractGlmXml(texts.join(''))
  const out: LanguageModelV4StreamPart[] = [...passthrough]

  if (text) {
    out.push({ type: 'text-start', id: textId })
    out.push({ type: 'text-delta', id: textId, delta: text })
    out.push({ type: 'text-end', id: textId })
  }

  for (const call of calls) {
    const id = nextToolCallId()
    const input = JSON.stringify(call.args)
    out.push({ type: 'tool-input-start', id, toolName: call.name })
    out.push({ type: 'tool-input-delta', id, delta: input })
    out.push({ type: 'tool-input-end', id })
    out.push({ type: 'tool-call', toolCallId: id, toolName: call.name, input })
  }

  if (finish) {
    const finishReason = calls.length > 0 && finish.finishReason.unified === 'stop'
      ? { unified: 'tool-calls' as const, raw: finish.finishReason.raw }
      : finish.finishReason
    out.push({ ...finish, finishReason })
  }

  return out
}

export const glmXmlToolMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v4',
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate()
    const { content, recovered } = recoverGlmXmlContent(result.content)
    if (recovered === 0) return result
    const finishReason = result.finishReason.unified === 'stop'
      ? { unified: 'tool-calls' as const, raw: result.finishReason.raw }
      : result.finishReason
    return { ...result, content, finishReason }
  },
  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream()
    const chunks: LanguageModelV4StreamPart[] = []
    const transform = new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
      transform(chunk) {
        chunks.push(chunk)
      },
      flush(controller) {
        for (const chunk of rewriteGlmXmlStream(chunks)) controller.enqueue(chunk)
      },
    })
    return { stream: stream.pipeThrough(transform), ...rest }
  },
}

/** Wrap a Gateway model id so leaked GLM XML becomes tool-call parts. */
export function wrapGlmXmlModel(modelId: string) {
  return wrapLanguageModel({
    model: gateway(modelId),
    middleware: glmXmlToolMiddleware,
  })
}
