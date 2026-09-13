/** Pre-step extension composition and lifetime, without an active model call. */
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { installPromptContexts, promptContexts } from '../src/prompt-contexts.ts'
import type { SessionRequestId } from '../src/types.ts'

describe('prompt context expansion', () => {
  it('preserves waterfall decisions, strips pending metadata, and unregisters with its owner', async () => {
    const ctx = new Context()
    try {
      const fiber = await ctx.plugin({ name: 'test-prompt-contexts', apply: installPromptContexts })
      const agent = { id: SessionId('contexts'), ctx } as Agent
      const message = createUserMessage({ content: [], source: {
        kind: 'user', rpcId: 'one' as SessionRequestId, clientTimeZone: 'Asia/Shanghai',
        contexts: [{ plugin: 'plain', text: 'plain context' }, { plugin: 'quoted', text: 'quote', form: 'annotation' as const }],
      } })
      const dispatch = (decision: PreStepDecision) => agentEvents(ctx, agent).waterfall(
        'agent/pre-step', { messages: [message], turn: 1, step: 1, signal: new AbortController().signal },
        () => Promise.resolve(decision),
      )
      const enter = { kind: 'enter' as const, messages: [message], startsRequestSeries: true as const }
      const expanded = await dispatch(enter)
      expect(expanded).toMatchObject({ kind: 'enter', startsRequestSeries: true, messages: [
        { content: [{ type: 'text', text: 'plain context' }], source: { kind: 'plugin', plugin: 'plain' } },
        { content: [{ type: 'text', text: 'quote' }], source: { kind: 'plugin', plugin: 'quoted', form: 'annotation', submissionId: 'one' } },
        { id: message.id, content: [], source: { kind: 'user', rpcId: 'one', clientTimeZone: 'Asia/Shanghai' } },
      ] })
      if (expanded.kind !== 'enter') throw new Error('expected entered messages')
      expect(expanded.messages[2]!.source).not.toHaveProperty('contexts')
      expect(message.source.contexts).toHaveLength(2)
      const reject = { kind: 'reject' as const }
      expect(await dispatch(reject)).toBe(reject)
      expect(await dispatch({ ...enter, messages: [] })).toEqual({ ...enter, messages: [] })
      await fiber.dispose()
      expect(await dispatch(enter)).toBe(enter)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it.each([null, {}, [null], [{ plugin: 'p', text: 'x', form: 'unknown' }]])(
    'rejects malformed boundary input: %j', (input) => {
      expect(() => promptContexts(input as never)).toThrow('prompt contexts require')
    },
  )
})
