/** Host registration for browser conversation preferences. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import { CONVERSATION_SETTINGS_NAMESPACE, ConversationSettingsSchema } from './submission-settings.ts'

export {
  BUSY_ENTER_BEHAVIORS, BUSY_ENTER_FIELD, CONVERSATION_SETTINGS_NAMESPACE,
  DEFAULT_BUSY_ENTER_BEHAVIOR, type BusyEnterBehavior, type ConversationSettings,
} from './submission-settings.ts'

/**
 * Register the durable conversation section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context, config: Config = { showCommandLauncher: true }): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      CONVERSATION_SETTINGS_NAMESPACE,
      ConversationSettingsSchema,
      { base: config },
    )
  })
}

/** Profile-owned composer presentation defaults. */
export interface Config {
  /** Show the command-menu button without changing slash-command support. */
  showCommandLauncher: boolean
}

/** Validate composer presentation defaults. */
export const Config: z<Config> = z.object({ showCommandLauncher: z.boolean().default(true) })
