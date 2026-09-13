/** Submission-owned context stays in the durable inbox until its prompt is admitted. */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage, freezeMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { PromptContext } from './types.ts'

const contextsSchema = z.array(z.object({
  plugin: z.string().refine(value => value.trim() !== ''),
  text: z.string().refine(value => value.trim() !== ''),
  form: z.literal('annotation').optional(),
}).strict())

/**
 * Validate browser or persisted submission context without altering its text.
 * @param value - optional context array crossing the RPC or durable-message boundary.
 * @returns detached validated entries; absent context becomes an empty array.
 */
export function promptContexts(value: readonly PromptContext[] | undefined): readonly PromptContext[] {
  if (value === undefined) return []
  const parsed = contextsSchema.safeParse(value)
  if (!parsed.success) {
    throw new RemoteError('gateway/bad-request', 'prompt contexts require a non-empty plugin, text, and known form', {})
  }
  return parsed.data.map(({ plugin, text, form }) => ({
    plugin, text, ...(form === undefined ? {} : { form }),
  }))
}

function expandPrompt(message: UserMessage): UserMessage[] {
  const source = message.source
  if (source.kind !== 'user' || !('rpcId' in source) || source.contexts === undefined) return [message]
  const contexts = promptContexts(source.contexts)
  const { contexts: _contexts, ...userSource } = source
  return [
    ...contexts.map(context => createUserMessage({
      content: [{ type: 'text' as const, text: context.text }],
      source: context.form === undefined
        ? { kind: 'plugin' as const, plugin: context.plugin }
        : { kind: 'plugin' as const, plugin: context.plugin, form: context.form, submissionId: String(source.rpcId) },
    })),
    freezeMessage({ ...message, source: userSource }),
  ]
}

/**
 * Expand only accepted prompts through the existing pre-step waterfall.
 * Queue edits, removal, steering, cancellation, and replay retain one inbox owner.
 * @param ctx - Session Controller scope owning the listener and its disposal.
 */
export function installPromptContexts(ctx: Context): void {
  ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    return decision.kind === 'reject'
      ? decision
      : { ...decision, messages: decision.messages.flatMap(expandPrompt) }
  })
}
