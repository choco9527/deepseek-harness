/** Presentation defaults travel through the real Loader and Host settings provider. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import FileSettings from '@deepseek-ai/dsh-settings-file'
import * as Chat from '@deepseek-ai/dsh-client-ui-chat'
import * as Conversation from '@deepseek-ai/dsh-client-ui-conversation'
import * as Workspace from '@deepseek-ai/dsh-client-ui-workspace'
import * as Shell from '@deepseek-ai/dsh-client-ui-settings-general'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function boot(custom: boolean, saved = '') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-presentation-'))
  roots.push(root)
  const path = join(root, 'settings.yaml')
  await writeFile(path, saved)
  const configPath = join(root, 'cordis.yml')
  const modules = new Map<string, unknown>([
    ['settings', FileSettings], ['chat', Chat], ['conversation', Conversation],
    ['workspace', Workspace], ['shell', Shell],
  ])
  const config = custom ? {
    chat: { defaultTranscriptView: 'minimal', showComposerStats: false },
    conversation: { showCommandLauncher: false },
    workspace: { showSessionSearch: false, showGroupingControls: false },
    shell: { presentation: 'page' },
  } : {}
  await writeFile(configPath, JSON.stringify([
    { name: 'settings', config: { path, debounceMs: 10 } },
    ...['chat', 'conversation', 'workspace', 'shell'].map(name => ({
      name, config: config[name as keyof typeof config] ?? {},
    })),
  ]))
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    version: 'v2',
    async import(name: string) {
      if (!modules.has(name)) throw new Error(`Unexpected test module: ${name}`)
      return modules.get(name)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

describe('host-owned UI composition', () => {
  it('defaults to visible controls, compact transcript and a modal shell', async () => {
    const ctx = await boot(false)
    expect(ctx.settings.get('ui-chat')).toEqual({ transcriptView: 'compact', showComposerStats: true })
    expect(ctx.settings.get('ui-conversation')).toEqual({ busyEnter: 'queue', showCommandLauncher: true })
    expect(ctx.settings.get('ui-workspace')).toEqual({ showSessionSearch: true, showGroupingControls: true })
    expect(ctx.settings.get('ui-settings-shell')).toEqual({ presentation: 'modal' })
  })

  it('accepts product defaults while keeping an existing transcript choice', async () => {
    const ctx = await boot(true, 'ui-chat:\n  transcriptView: normal\n')
    expect(ctx.settings.get('ui-chat')).toEqual({ transcriptView: 'normal', showComposerStats: false })
    expect(ctx.settings.get('ui-conversation')).toEqual({ busyEnter: 'queue', showCommandLauncher: false })
    expect(ctx.settings.get('ui-workspace')).toEqual({ showSessionSearch: false, showGroupingControls: false })
    expect(ctx.settings.get('ui-settings-shell')).toEqual({ presentation: 'page' })
    expect(ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === 'ui-chat')?.base)
      .toEqual({ transcriptView: 'minimal', showComposerStats: false })
  })

  it('rejects invalid presentation configuration', () => {
    expect(() => Chat.Config({ showComposerStats: 'false' } as never)).toThrow()
    expect(() => Conversation.Config({ showCommandLauncher: 'false' } as never)).toThrow()
    expect(() => Workspace.Config({ showSessionSearch: 'false' } as never)).toThrow()
    expect(() => Shell.Config({ presentation: 'drawer' } as never)).toThrow()
  })
})
