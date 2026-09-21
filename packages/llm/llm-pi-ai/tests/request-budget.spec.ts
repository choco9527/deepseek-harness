import { describe, expect, it } from 'vitest'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { assertRequestBodyBudget, offloadHistoricalImages } from '../src/request-budget.ts'

const ref: ImageAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
  mediaType: 'image/png', bytes: 30, width: 1, height: 1,
}
const image = (source: 'user' | 'tool', suffix = 'a') => createUserMessage({
  source: source === 'user' ? { kind: 'user' } : { kind: 'tool', callId: ToolCallId(suffix) },
  content: [{ type: 'image', attachment: { ...ref, attachmentId: AttachmentId(`sha256:${suffix.repeat(64)}`) } }],
})
const policy = { representation: 'base64' as const, maxBytes: 80, byteQuantum: 1,
  placeholder: (value: ImageAttachmentRef) => `omitted ${value.attachmentId}` }

describe('provider request budgets', () => {
  it('bounds a seventeen-image history without changing its messages or attachment references', () => {
    const messages = Array.from({ length: 17 }, (_, index) => image('user', (index % 16).toString(16)))
    const projected = offloadHistoricalImages(messages, { ...policy, maxBytes: 160 })
    expect(projected.filter(message => message.content[0]?.type === 'image')).toHaveLength(4)
    expect(projected.slice(13)).toEqual(messages.slice(13))
    expect(messages.every(message => message.content[0]?.type === 'image')).toBe(true)
    expect(projected[0]?.content[0]).toEqual({ type: 'text', text: `omitted sha256:${'0'.repeat(64)}` })
  })

  it('counts UTF-8 JSON bytes including tools, permits the exact boundary and rejects one byte over', () => {
    const payload = { messages: [{ content: '你好' }], tools: [{ description: '工具' }] }
    const bytes = Buffer.byteLength(JSON.stringify(payload))
    expect(() => assertRequestBodyBudget(payload, bytes)).not.toThrow()
    expect(() => assertRequestBodyBudget(payload, bytes - 1)).toThrow(/request body.*budget/i)
  })

  it('offloads old occurrences while preserving current user images and the newest tool image', () => {
    const messages = [image('user'), image('tool', 'b'), image('user', 'c'), image('tool', 'd')]
    const original = JSON.stringify(messages)
    const result = offloadHistoricalImages(messages, policy)
    expect(result.slice(0, 2).map(message => message.content[0]?.type)).toEqual(['text', 'text'])
    expect(result.slice(2)).toEqual(messages.slice(2))
    expect(JSON.stringify(messages)).toBe(original)
  })

  it('refuses to silently drop current images when they alone exceed the image budget', () => {
    expect(() => offloadHistoricalImages([image('user')], { ...policy, maxBytes: 39 }))
      .toThrow(/current.*images.*budget/i)
  })

  it('can offload older user images after a new text-only user message', () => {
    const current = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'continue' }] })
    const result = offloadHistoricalImages([image('user'), current, image('tool', 'b')], { ...policy, maxBytes: 40 })
    expect(result[0]?.content[0]?.type).toBe('text')
    expect(result[2]?.content[0]?.type).toBe('image')
  })
})
