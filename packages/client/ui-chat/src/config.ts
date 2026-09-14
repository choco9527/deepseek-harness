/** Deployment-owned Chat presentation configuration. */
import z from '@deepseek-ai/schemastery'

/** Presentation overrides supplied by the application, not user preferences. */
export interface Config {
  /** Keep messages visible, fold only completed-turn tools, and hide the mode selector. */
  toolsOnlyTranscript?: boolean
}

/** Opt-in tool folding; omitted configuration preserves user-selected presentation. */
export const Config: z<Config> = z.object({
  toolsOnlyTranscript: z.boolean().default(false),
})

/** HTML bootstrap key containing only the public Chat presentation policy. */
export const CHAT_PRESENTATION_GLOBAL = '__DSH_CHAT_PRESENTATION__'

/**
 * Validate the Host's public presentation bootstrap before browser composition.
 * @param value - untrusted bootstrap JSON; absent in unconfigured embeddings.
 * @returns Validated presentation with upstream defaults when absent.
 */
export function parseChatPresentation(value: unknown): Config {
  // Schemastery validates this unknown wire value; its call signature describes the output type.
  return Config((value === undefined ? {} : value) as Config)
}
