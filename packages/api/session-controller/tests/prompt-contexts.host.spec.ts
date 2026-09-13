/** Real-loop regressions for submission-owned context admission and queue mutation. */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import { createSessionTestRemote } from './test-remote.ts'
import type { PromptContext, SessionRequestId } from '../src/types.ts'

class PausedAdapter extends LlmAdapter {
  readonly entered = Promise.withResolvers<undefined>()
  readonly release = Promise.withResolvers<undefined>()
  readonly requests: GenerateOptions[] = []

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length === 1) {
      this.entered.resolve(undefined)
      await this.release.promise
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

async function harness(seed?: readonly SessionEvent[]) {
  const ctx = new Context()
  const adapter = new PausedAdapter()
  cleanups.push(async () => { adapter.release.resolve(undefined); await ctx.fiber.dispose() })
  await mountAgentLoopTestDependencies(ctx)
  ctx.llm.registerAdapter(['mock'], adapter)
  const driver = await mountAgentLoopTestHarness(ctx)
  const remote = createSessionTestRemote(ctx, {
    defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }),
    cwd: '/tmp',
  })
  const agent = seed === undefined
    ? await driver.create(SessionId('prompt-contexts'), { provider: 'mock', model: 'mock' })
    : (await ctx.agents.create({ sessionId: SessionId('restored-contexts'), seed: [...seed],
      agentOptions: { provider: 'mock', model: 'mock' },
    })).agent
  const prompt = (id: string, text: string, contexts?: readonly PromptContext[], mode: 'queue' | 'steer' = 'queue') => remote.prompt({
    sessionId: agent.id, requestId: id as SessionRequestId, mode,
    content: text === '' ? [] : [{ type: 'text', text }],
    ...(contexts === undefined ? {} : { contexts }),
  })
  return { ctx, adapter, agent, remote, prompt }
}

function annotation(text: string): PromptContext[] {
  return [{ plugin: 'dsh-add-to-chat', form: 'annotation', text }]
}

function delivered(session: Session) {
  let turn = 0
  return session.snapshotEvents().flatMap((event) => {
    if (event.type === 'turn/start') turn = event.data.turn
    if (event.type !== 'user/message') return []
    const message = event.data
    if (message.source.kind !== 'user' && !(message.source.kind === 'plugin' && message.source.plugin === 'dsh-add-to-chat')) return []
    return [{ turn, source: message.source.kind, text: message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('') }]
  })
}

describe('submission-owned prompt contexts', () => {
  it('keeps two queued references out of the active turn and delivers each with its own prompt', async () => {
    const h = await harness()
    expect((await h.prompt('active', 'active')).ok).toBe(true)
    await h.adapter.entered.promise
    expect((await h.prompt('second', 'second', annotation('reference two'))).ok).toBe(true)
    expect((await h.prompt('third', 'third', annotation('reference three'))).ok).toBe(true)
    h.adapter.release.resolve(undefined)
    await h.agent.whenIdle()
    expect(delivered(h.agent.session)).toEqual([
      { turn: 1, source: 'user', text: 'active' },
      { turn: 2, source: 'plugin', text: 'reference two' },
      { turn: 2, source: 'user', text: 'second' },
      { turn: 3, source: 'plugin', text: 'reference three' },
      { turn: 3, source: 'user', text: 'third' },
    ])
    expect(h.adapter.requests).toHaveLength(3)
  })

  it('accepts a context-only prompt and retains its correlated user identity', async () => {
    const h = await harness()
    h.adapter.release.resolve(undefined)
    expect((await h.prompt('context-only', '', annotation('reference only'))).ok).toBe(true)
    await h.agent.whenIdle()
    expect(delivered(h.agent.session)).toEqual([
      { turn: 1, source: 'plugin', text: 'reference only' },
      { turn: 1, source: 'user', text: '' },
    ])
  })

  it('removes references with a deleted queued prompt', async () => {
    const h = await harness()
    await h.prompt('active', 'active')
    await h.adapter.entered.promise
    await h.prompt('deleted', 'deleted', annotation('deleted reference'))
    const item = h.agent.inbox.nextTurn[0]!
    expect((await h.remote.updateQueue({ sessionId: h.agent.id, itemId: item.id, action: { kind: 'remove' } })).ok).toBe(true)
    h.adapter.release.resolve(undefined)
    await h.agent.whenIdle()
    expect(delivered(h.agent.session)).toEqual([{ turn: 1, source: 'user', text: 'active' }])
    expect(h.adapter.requests).toHaveLength(1)
  })

  it('preserves references when editing and steering the queued prompt', async () => {
    const h = await harness()
    await h.prompt('active', 'active')
    await h.adapter.entered.promise
    await h.prompt('edited', 'before', annotation('kept reference'))
    const item = h.agent.inbox.nextTurn[0]!
    expect((await h.remote.updateQueue({ sessionId: h.agent.id, itemId: item.id,
      action: { kind: 'edit', content: [{ type: 'text', text: 'after' }] },
    })).ok).toBe(true)
    expect((await h.remote.updateQueue({ sessionId: h.agent.id, itemId: item.id, action: { kind: 'steer' } })).ok).toBe(true)
    h.adapter.release.resolve(undefined)
    await h.agent.whenIdle()
    expect(delivered(h.agent.session)).toEqual([
      { turn: 1, source: 'user', text: 'active' },
      { turn: 1, source: 'plugin', text: 'kept reference' },
      { turn: 1, source: 'user', text: 'after' },
    ])
  })

  it('restores pending context from serialized Session events after cancellation', async () => {
    const first = await harness()
    await first.prompt('active', 'active')
    await first.adapter.entered.promise
    await first.prompt('parked', 'parked', annotation('restored reference'))
    expect((await first.remote.cancel({ sessionId: first.agent.id })).ok).toBe(true)
    first.adapter.release.resolve(undefined)
    await first.agent.whenIdle()
    const seed = JSON.parse(JSON.stringify(first.agent.session.snapshotEvents())) as SessionEvent[]
    const second = await harness(seed)
    second.adapter.release.resolve(undefined)
    await second.prompt('wake', 'wake')
    await second.agent.whenIdle()
    expect(delivered(second.agent.session).slice(1)).toEqual([
      { turn: 2, source: 'plugin', text: 'restored reference' },
      { turn: 2, source: 'user', text: 'parked' },
      { turn: 3, source: 'user', text: 'wake' },
    ])
  })

  it('deduplicates a retried queued submission and keeps the originally accepted context', async () => {
    const h = await harness()
    await h.prompt('active', 'active')
    await h.adapter.entered.promise
    await h.prompt('same', 'original', annotation('original reference'))
    expect((await h.prompt('same', 'retry', annotation('retry reference'))).ok).toBe(true)
    h.adapter.release.resolve(undefined)
    await h.agent.whenIdle()
    expect(delivered(h.agent.session).slice(1)).toEqual([
      { turn: 2, source: 'plugin', text: 'original reference' },
      { turn: 2, source: 'user', text: 'original' },
    ])
  })

  it.each([[], [{ plugin: 'p', text: '   ' }], [{ plugin: '', text: 'reference' }]].map(contexts => ({ contexts })))(
    'rejects empty or invalid context-only input before changing the Session: %j', async ({ contexts }) => {
      const h = await harness()
      const before = h.agent.session.snapshotEvents()
      expect((await h.prompt('invalid', '', contexts)).ok).toBe(false)
      expect(h.agent.session.snapshotEvents()).toEqual(before)
    },
  )
})
