/** Host loader entry for the browser implementation exported from `./client`. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'

/** Durable settings namespace for product-wide GUI onboarding facts. */
const ONBOARDING_SETTINGS_NAMESPACE = 'ui-onboarding'

interface OnboardingSettings {
  /** Last version acknowledged by the current product welcome step. */
  welcomeNoticeVersion?: string
}

const OnboardingSettingsSchema: z<OnboardingSettings> = z.object({
  welcomeNoticeVersion: z.string(),
})

/** Register the durable GUI-onboarding section when a settings provider exists. */
export function apply(ctx: Context, config: Config = { presentation: 'modal' }): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register('ui-settings-shell', Config, { base: config })
    settingsCtx.settings.register(
      ONBOARDING_SETTINGS_NAMESPACE,
      OnboardingSettingsSchema,
    )
  })
}

/** Settings presentation selected by the composing host. */
export interface Config {
  /** Centered dialog or full-window page; sections are shared. */
  presentation: 'modal' | 'page'
}

/** Validate the settings shell presentation. */
export const Config: z<Config> = z.object({
  presentation: z.union(['modal', 'page']).default('modal'),
})
