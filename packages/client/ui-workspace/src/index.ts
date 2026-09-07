/** Host registration for workspace browsing presentation defaults. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Profile-owned workspace browsing controls. */
export interface Config {
  /** Show session search in both sidebar widths. */
  showSessionSearch: boolean
  /** Show grouping and sorting controls without changing stored ordering. */
  showGroupingControls: boolean
}

/** Validate workspace browsing presentation defaults. */
export const Config: z<Config> = z.object({
  showSessionSearch: z.boolean().default(true),
  showGroupingControls: z.boolean().default(true),
})

/** Register browser presentation defaults on the Host settings lifecycle.
 * @param ctx - Host context with an optional settings provider.
 * @param config - Profile defaults overridden by explicit user settings.
 */
export function apply(ctx: Context, config: Config = { showSessionSearch: true, showGroupingControls: true }): void {
  ctx.inject(['settings'], (scope) => {
    scope.settings.register('ui-workspace', Config, { base: config })
  })
}
