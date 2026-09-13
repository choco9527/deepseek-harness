/** Keyless submission-context coverage through the shipped Web composition and authenticated RPC. */
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveReplayScript, parseSessionLog, type ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { compareOrRefreshGolden, launchWebScaffold, webSnapshotMode, type WebScaffold } from './scaffold.ts'

const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/live-interactions/session.v3.jsonl', import.meta.url))
const EXPECTED = fileURLToPath(new URL('../../../snapshots/web/prompt-contexts/delivered.expected.json', import.meta.url))
const MODE = webSnapshotMode()

async function rpc<T>(scaffold: WebScaffold, method: string, request: object): Promise<T> {
  const response = await scaffold.hostFetch(`/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: method, method, payload: { args: { request } } }),
  })
  expect(response.status).toBe(200)
  const body = await response.json() as { result: { ok: true; value: T } | { ok: false; error: unknown } }
  if (!body.result.ok) throw new Error(`${method}: ${JSON.stringify(body.result.error)}`)
  return body.result.value
}

function delivered(events: readonly SessionEvent[]) {
  let turn = 0
  return events.flatMap((event) => {
    if (event.type === 'turn/start') turn = event.data.turn
    if (event.type !== 'user/message') return []
    const { source, content } = event.data
    if (source.kind !== 'user' && !(source.kind === 'plugin' && source.plugin === 'dsh-add-to-chat')) return []
    return [{ turn, source: source.kind, text: content.flatMap(block => block.type === 'text' ? [block.text] : []).join('') }]
  })
}

describe('web e2e: submission-owned contexts', () => {
  let scaffold: WebScaffold | undefined
  let root: string | undefined
  afterEach(async () => {
    try { await scaffold?.close() } finally {
      scaffold = undefined
      if (root !== undefined) await rm(root, { recursive: true, force: true })
      root = undefined
    }
  })

  it.skipIf(MODE === 'record')('keeps queued context parked through stop and admits a context-only prompt over RPC', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-web-prompt-contexts-'))
    const readyFile = join(root, 'ready')
    const overridePath = join(root, 'replay.json')
    const recorded = deriveReplayScript(parseSessionLog(await readFile(FIXTURE, 'utf8')))
    expect(recorded).toHaveLength(1)
    const replay: ReplayEntry[] = [{ kind: 'hang', readyFile }, recorded[0]!, recorded[0]!]
    await writeFile(overridePath, JSON.stringify(replay))
    scaffold = await launchWebScaffold({ replayFixture: FIXTURE, replayOverride: overridePath, compareReplaySession: false })
    const { sessionId } = await rpc<{ sessionId: SessionId }>(scaffold, 'session/create', { cwd: scaffold.workspaceCwd })
    const prompt = (requestId: string, text: string, reference?: string) => rpc(scaffold!, 'session/prompt', {
      sessionId, requestId, mode: 'queue', content: text === '' ? [] : [{ type: 'text', text }],
      ...(reference === undefined ? {} : { contexts: [{ plugin: 'dsh-add-to-chat', text: reference, form: 'annotation' }] }),
    })
    const stopped = scaffold.whenTurnSettled()
    await prompt('active', 'active')
    await expect.poll(() => existsSync(readyFile)).toBe(true)
    await prompt('queued', 'queued', 'queued reference')
    const agent = scaffold.ctx.agents.get(sessionId)!
    expect(agent.inbox.nextStep).toHaveLength(0)
    await rpc(scaffold, 'session/cancel', { sessionId })
    await stopped
    expect(delivered(agent.session.snapshotEvents())).toEqual([{ turn: 1, source: 'user', text: 'active' }])
    const settled = scaffold.whenTurnSettled()
    await prompt('context-only', '', 'reference only')
    await settled
    await agent.whenIdle()
    const result = delivered(agent.session.snapshotEvents())
    await compareOrRefreshGolden(EXPECTED, JSON.stringify(result, null, 2), MODE)
    const page = await rpc<{ records: unknown[] }>(scaffold, 'session/page', {
      address: { kind: 'session', sessionId }, throughSeq: agent.session.snapshotEvents().at(-1)!.seq,
    })
    expect(JSON.stringify(page.records)).toContain('reference only')
  })
})
