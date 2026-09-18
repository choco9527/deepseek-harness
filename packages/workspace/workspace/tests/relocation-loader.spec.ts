/** Recorded history survives a host directory relocation through the real Loader and JSONL provider. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as storage from '@deepseek-ai/dsh-storage'
import * as jsonStorage from '@deepseek-ai/dsh-storage-json'
import * as domain from '@deepseek-ai/dsh-storage-domain'
import * as persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { generationLogPath } from '@deepseek-ai/dsh-session-persistence-jsonl/src/format.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as workspace from '../src/index.ts'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

async function boot(root: string, relocations: Array<{ from: string; to: string }>): Promise<Context> {
  const ctx = new Context()
  const config = join(root, 'cordis.yml')
  await writeFile(config, JSON.stringify([
    { name: '@deepseek-ai/dsh-storage' },
    { name: '@deepseek-ai/dsh-storage-json', config: { root: join(root, 'storage') } },
    { name: '@deepseek-ai/dsh-storage-domain', config: { backend: 'json' } },
    { name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: join(root, 'sessions'), compression: 'none' } },
    { name: '@deepseek-ai/dsh-workspace', config: { pathRelocations: relocations } },
  ]))
  try {
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-storage', storage], ['@deepseek-ai/dsh-storage-json', jsonStorage],
      ['@deepseek-ai/dsh-storage-domain', domain], ['@deepseek-ai/dsh-session-persistence-jsonl', persistence],
      ['@deepseek-ai/dsh-workspace', workspace],
    ])
    ctx.loader.internal = { version: 'v2', async import(name: string) {
      if (!modules.has(name)) throw new Error(`Unexpected Loader import: ${name}`)
      return modules.get(name)
    } } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await ctx.loader.await()
    return ctx
  } catch (cause) { await ctx.fiber.dispose(); throw cause }
}

it('reopens recorded session history with the same workspace id and unchanged generation bytes', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'workspace-relocation-loader-')))
  const from = join(root, 'legacy-workspace')
  const to = join(root, 'argo-workspace')
  const sessionId = SessionId('relocation-recorded-session')
  const log = generationLogPath(join(root, 'sessions'), from, sessionId, 3, 'none')
  let ctx: Context | undefined
  try {
    await mkdir(from)
    await mkdir(dirname(log), { recursive: true })
    const recorded = await readFile(new URL('../../../../snapshots/session/workspace-edit/session.v3.jsonl', import.meta.url), 'utf8')
    const rows = recorded.trim().split('\n').map((row, index) => {
      const value = JSON.parse(row) as Record<string, unknown>
      return index === 0 ? { ...value, id: sessionId, cwd: from } : { ...value, seq: index - 1, time: 1000 + index }
    })
    const source = rows.map(row => JSON.stringify(row)).join('\n') + '\n'
    await writeFile(log, source)
    ctx = await boot(root, [])
    const original = ctx.workspaceRegistry.list()[0]!
    expect(original.sessionIds).toEqual([sessionId])
    const id = original.id
    const before = await ctx.sessionPersistence.open(sessionId, 'read')
    const expected = await before.read()
    await before.close()
    await ctx.fiber.dispose()
    ctx = undefined
    await rename(from, to)
    await symlink(to, from, process.platform === 'win32' ? 'junction' : 'dir')
    ctx = await boot(root, [{ from, to }])
    expect(ctx.workspaceRegistry.get(id)?.path).toBe(to)
    expect(ctx.workspaceRegistry.get(id)?.sessionIds).toEqual([sessionId])
    const handle = await ctx.sessionPersistence.open(sessionId, 'write')
    try {
      const restored = await handle.read()
      expect(handle.header.cwd).toBe(from)
      expect(restored.events).toEqual(expected.events)
      expect(restored.events.filter(event => event.type === 'user/message')).toHaveLength(2)
      expect(restored.events.at(-1)?.type).toBe('turn/end')
    } finally { await handle.close() }
    await ctx.sessionPersistence.flush()
    expect(await readFile(log, 'utf8')).toBe(source)
  } finally {
    await ctx?.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
