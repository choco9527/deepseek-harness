import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
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
  it('registers, validates, and disposes the transcript-view namespace', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const ns = CHAT_SETTINGS_NAMESPACE

    expect(ctx.settings.get(ns)).toEqual({ transcriptView: DEFAULT_TRANSCRIPT_VIEW_MODE, showComposerStats: true })
    await ctx.settings.update(ns, { transcriptView: 'normal' })
    expect(ctx.settings.get(ns)).toEqual({ transcriptView: 'normal', showComposerStats: true })
    await expect(ctx.settings.update(ns, { transcriptView: 'dense' })).rejects.toThrow()

    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('loads without a settings provider', async () => {
    const ctx = new Context()
    await expect(ctx.plugin({ apply }).await()).resolves.toBeDefined()
  })

  it('uses the profile default until a user preference exists', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply }, { defaultTranscriptView: 'minimal' })
    await fiber.await()

    expect(ctx.settings.get(CHAT_SETTINGS_NAMESPACE)).toEqual({ transcriptView: 'minimal', showComposerStats: true })
  })
})
