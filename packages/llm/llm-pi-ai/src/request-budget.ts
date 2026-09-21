/** Deterministic image retention and serialized JSON bounds for gateway requests. */
import { contentHasImage, LlmError, offloadRequestImagesWithPolicy } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, Message, RequestImageOffloadPolicy } from '@deepseek-ai/dsh-llm'

/**
 * Reject a complete JSON payload above the configured UTF-8 byte bound.
 * @param payload - SDK-assembled request, including messages, tools and options.
 * @param maxBytes - Deployment-owned request-body bound.
 * @throws {LlmError} INVALID_REQUEST before transmission when the payload exceeds the bound.
 */
export function assertRequestBodyBudget(payload: unknown, maxBytes: number): void {
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  if (bytes > maxBytes) {
    throw new LlmError(
      `Invalid request: request body exceeds the ${maxBytes}-byte budget. `
      + 'Reduce current attachments or compact the conversation before sending again.',
      'INVALID_REQUEST',
    )
  }
}

function imageBytes(blocks: readonly ContentBlock[], policy: RequestImageOffloadPolicy): number {
  return blocks.reduce((sum, block) => {
    if (block.type === 'tool-result') return sum + imageBytes(block.content, policy)
    if (block.type !== 'image') return sum
    const bytes = policy.byteLength?.(block.attachment) ?? block.attachment.bytes
    return sum + (policy.representation === 'base64' ? 4 * Math.ceil(bytes / 3) : bytes)
  }, 0)
}

/**
 * Offload older images without dropping the latest user attachments or newest image read after that user.
 * @param messages - Durable request history; never mutated.
 * @param policy - Request-version byte accounting and existing omission text.
 * @param estimatesOnly - Keep oversized current images until their actual request versions are prepared.
 * @returns A transient projection with protected current images and oldest-first historical offload.
 * @throws {LlmError} INVALID_REQUEST when protected images alone exceed the image-byte budget.
 */
export function offloadHistoricalImages(
  messages: readonly Message[],
  policy: RequestImageOffloadPolicy,
  estimatesOnly = false,
): readonly Message[] {
  const lastUser = messages.findLastIndex(message => message.source.kind === 'user')
  const lastImage = messages.findLastIndex(message => contentHasImage(message.content))
  const protectedIndexes = new Set([lastUser, ...(lastImage > lastUser ? [lastImage] : [])])
  const protectedBytes = messages.reduce((sum, message, index) =>
    sum + (protectedIndexes.has(index) ? imageBytes(message.content, policy) : 0), 0)
  if (!estimatesOnly && policy.maxBytes !== undefined && protectedBytes > policy.maxBytes) {
    throw new LlmError(
      'Invalid request: current images exceed the request image budget. '
      + 'Use fewer or smaller current images; they have not been silently omitted.',
      'INVALID_REQUEST',
    )
  }
  const historical = messages.flatMap((message, index) => protectedIndexes.has(index) ? [] : [{ message, index }])
  const projected = offloadRequestImagesWithPolicy(historical.map(entry => entry.message), {
    ...policy,
    ...policy.maxBytes === undefined ? {} : { maxBytes: Math.max(0, policy.maxBytes - protectedBytes) },
  })
  const byIndex = new Map(historical.map((entry, index) => [entry.index, projected[index]]))
  return messages.map((message, index) => byIndex.get(index) ?? message)
}
