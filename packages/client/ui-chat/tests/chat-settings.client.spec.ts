import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { CHAT_PRESENTATION_GLOBAL, parseChatPresentation } from '../src/config.ts'
import {
  CHAT_SETTINGS_NAMESPACE, DEFAULT_TRANSCRIPT_VIEW_MODE, apply,
} from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

describe('ui-chat Host settings', () => {
  it('publishes the public policy without rewriting durable mode preferences', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply }, { toolsOnlyTranscript: true })
    await fiber.await()
    await ctx.settings.update(CHAT_SETTINGS_NAMESPACE, { transcriptView: 'normal' })
    const rows: IndexInjection[] = []
    ctx.emit('webserver/index-inject', rows)
    expect(rows).toEqual([{ kind: 'global', name: CHAT_PRESENTATION_GLOBAL, value: { toolsOnlyTranscript: true } }])
    expect(ctx.settings.get(CHAT_SETTINGS_NAMESPACE)).toEqual({ transcriptView: 'normal' })
    await fiber.dispose()
    const after: IndexInjection[] = []
    ctx.emit('webserver/index-inject', after)
    expect(after).toEqual([])
  })

  it('validates public bootstrap JSON', () => {
    expect(parseChatPresentation(undefined)).toEqual({ toolsOnlyTranscript: false })
    expect(parseChatPresentation({ toolsOnlyTranscript: true })).toEqual({ toolsOnlyTranscript: true })
    expect(() => parseChatPresentation({ toolsOnlyTranscript: 'yes' })).toThrow()
  })

  it('registers, validates, and disposes the transcript-view namespace', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const ns = CHAT_SETTINGS_NAMESPACE

    expect(ctx.settings.get(ns)).toEqual({ transcriptView: DEFAULT_TRANSCRIPT_VIEW_MODE })
    await ctx.settings.update(ns, { transcriptView: 'normal' })
    expect(ctx.settings.get(ns)).toEqual({ transcriptView: 'normal' })
    await expect(ctx.settings.update(ns, { transcriptView: 'dense' })).rejects.toThrow()

    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('loads without a settings provider', async () => {
    const ctx = new Context()
    await expect(ctx.plugin({ apply }).await()).resolves.toBeDefined()
  })
})
