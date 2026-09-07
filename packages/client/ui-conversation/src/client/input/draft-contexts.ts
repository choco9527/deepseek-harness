/**
 * Draft-context registry: plugin-owned context that leaves the composer only
 * when an ordinary prompt is admitted.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PromptContext } from '@deepseek-ai/dsh-api-session-controller/types'

/** One plugin-owned context item ready for one prompt admission. */
export interface DraftContextItem {
  /** Stable source-local identity used to settle the exact captured item. */
  readonly id: string
  /** Plugin package name recorded as the durable context source. */
  readonly plugin: string
  /** Model-visible text recorded in the durable context message. */
  readonly text: string
  /** Optional semantic presentation recorded with the durable context message. */
  readonly form?: 'annotation'
}

/** One source that owns mutable context items for a session. */
export interface DraftContextSource {
  /** Registry-wide stable source identity. */
  readonly id: string
  /** Whether this source currently owns draft context for one Session. */
  has(sessionId: SessionId): boolean
  /** Remove the current session's items into one pending prompt capture. */
  take(sessionId: SessionId): readonly DraftContextItem[]
  /** Retire accepted items or return refused items to this source's draft. */
  settle(sessionId: SessionId, items: readonly DraftContextItem[], accepted: boolean): void
}

interface CapturedSourceItems {
  readonly source: DraftContextSource
  readonly items: readonly DraftContextItem[]
}

/** One immutable capture retained by a detached prompt until settlement. */
export interface CapturedDraftContexts {
  /** Browser→Host prompt contexts in stable registration/item order. */
  readonly contexts: readonly PromptContext[]
  /** Settle every captured source exactly once. */
  settle(accepted: boolean): void
}

/** Empty context capture shared by ordinary prompts without contributors. */
export const EMPTY_DRAFT_CONTEXTS: CapturedDraftContexts = {
  contexts: [],
  settle() {},
}

/**
 * Registry owned by Conversation input. It coordinates source-local draft
 * state with the detached prompt lifecycle without putting context in Lexical.
 */
export class DraftContextRegistry {
  private readonly sources = new Map<string, DraftContextSource>()

  /**
   * Register one draft-context source. Duplicate ids fail at plugin activation.
   * @param source - Plugin-owned draft context contributor.
   * @returns Disposer that unregisters the contributor.
   */
  register(source: DraftContextSource): () => void {
    if (this.sources.has(source.id)) throw new Error(`conversation draft-context source "${source.id}" already registered`)
    this.sources.set(source.id, source)
    return () => { this.sources.delete(source.id) }
  }

  /**
   * Whether any registered source currently has context for one Session.
   * @param sessionId - Session whose pending draft is queried.
   * @returns Whether at least one contributor has pending context.
   */
  has(sessionId: SessionId): boolean {
    for (const source of this.sources.values()) {
      if (source.has(sessionId)) return true
    }
    return false
  }

  /**
   * Capture every current item for one prompt without exposing source mutation to the host.
   * @param sessionId - Session whose pending context is captured.
   * @returns Detached context items and their settlement callback.
   */
  take(sessionId: SessionId): CapturedDraftContexts {
    const captures: CapturedSourceItems[] = []
    const contexts: PromptContext[] = []
    for (const source of this.sources.values()) {
      const items = source.take(sessionId)
      if (items.length === 0) continue
      captures.push({ source, items })
      for (const item of items) {
        contexts.push({
          plugin: item.plugin,
          text: item.text,
          ...(item.form === undefined ? {} : { form: item.form }),
        })
      }
    }
    if (captures.length === 0) return EMPTY_DRAFT_CONTEXTS
    let settled = false
    return {
      contexts,
      settle(accepted) {
        if (settled) return
        settled = true
        for (const capture of captures) capture.source.settle(sessionId, capture.items, accepted)
      },
    }
  }
}
