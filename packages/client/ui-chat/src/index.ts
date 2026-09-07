/** Host registration for browser Chat preferences. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { CHAT_SETTINGS_NAMESPACE, ChatSettingsSchema } from './chat-settings.ts'
import { DEFAULT_TRANSCRIPT_VIEW_MODE, TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from './chat-settings.ts'

export {
  CHAT_SETTINGS_NAMESPACE, DEFAULT_TRANSCRIPT_VIEW_MODE, TRANSCRIPT_VIEW_FIELD,
  TRANSCRIPT_VIEW_MODES, type ChatSettings, type TranscriptViewMode,
} from './chat-settings.ts'

/** Composition default for the durable Chat transcript preference. */
export interface Config {
  /** Whether the composer displays session statistics. */
  readonly showComposerStats?: boolean
  /** Presentation mode used until a user saves a preference. */
  readonly defaultTranscriptView: TranscriptViewMode
}

/** Validate the profile-owned transcript default. */
export const Config: z<Config> = z.object({
  showComposerStats: z.boolean().default(true),
  defaultTranscriptView: z.union([...TRANSCRIPT_VIEW_MODES]).default(DEFAULT_TRANSCRIPT_VIEW_MODE),
})

/** Register the durable Chat settings section when a provider exists. */
export function apply(ctx: Context, config: Config = { defaultTranscriptView: DEFAULT_TRANSCRIPT_VIEW_MODE }): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      CHAT_SETTINGS_NAMESPACE,
      ChatSettingsSchema,
      { base: { transcriptView: config.defaultTranscriptView, showComposerStats: config.showComposerStats ?? true } },
    )
  })
}
