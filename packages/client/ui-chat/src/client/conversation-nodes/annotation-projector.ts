/** Same-request annotation projection for submitted messages. */
import type { ChatConversationViewNode, ChatNode } from '../contract/chat-nodes.ts'
import type { ChatNodeStore } from '../contract/snapshot.ts'
import type { PromptAnnotation } from './message.ts'

const EMPTY_ANNOTATIONS: readonly PromptAnnotation[] = []

function sameAnnotations(left: readonly PromptAnnotation[], right: readonly PromptAnnotation[]): boolean {
  return left.length === right.length && left.every((value, index) => value.text === right[index]?.text)
}

function stringField(value: unknown, field: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const candidate = (value as Record<string, unknown>)[field]
  return typeof candidate === 'string' && candidate !== '' ? candidate : undefined
}

function textContent(content: readonly unknown[]): string {
  return content.flatMap((block) => {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) return []
    const value = (block as Record<string, unknown>).text
    return typeof value === 'string' ? [value] : []
  }).join('')
}

function annotationContext(node: ChatConversationViewNode): {
  readonly submissionId: string
  readonly annotation: PromptAnnotation
} | undefined {
  const candidate = node as ChatNode
  if (candidate.kind !== 'context' || stringField(candidate.data.source, 'form') !== 'annotation') return undefined
  const submissionId = stringField(candidate.data.source, 'submissionId')
  const text = textContent(candidate.data.content)
  return submissionId === undefined || text === '' ? undefined : { submissionId, annotation: { text } }
}

function submittedMessageId(node: ChatConversationViewNode): string | undefined {
  const candidate = node as ChatNode
  if (candidate.kind !== 'user' && candidate.kind !== 'steering') return undefined
  return stringField(candidate.data.source, 'rpcId')
}

function withAnnotations(
  node: ChatConversationViewNode,
  annotations: readonly PromptAnnotation[],
): ChatConversationViewNode {
  const candidate = node as ChatNode
  if (candidate.kind !== 'user' && candidate.kind !== 'steering') return node
  const current = candidate.data.annotations ?? EMPTY_ANNOTATIONS
  const hasAnnotations = Object.hasOwn(candidate.data, 'annotations')
  if (sameAnnotations(current, annotations) && hasAnnotations === (annotations.length > 0)) return node
  const data: Record<string, unknown> = { ...candidate.data }
  if (annotations.length === 0) delete data.annotations
  else data.annotations = annotations
  return { ...candidate, data }
}

/** Associates submitted user messages with their same-request annotation contexts. */
export class AnnotationProjector {
  private readonly messagesBySubmissionId = new Map<string, string>()
  private readonly annotationsBySubmissionId = new Map<string, Map<string, PromptAnnotation>>()

  /**
   * Associate annotations across a complete loaded history.
   * @param nodes - complete Chat node set for the loaded history.
   * @returns nodes with same-request annotation summaries attached.
   */
  replace(nodes: readonly ChatConversationViewNode[]): readonly ChatConversationViewNode[] {
    this.messagesBySubmissionId.clear()
    this.annotationsBySubmissionId.clear()
    for (const node of nodes) this.record(node)
    return nodes.map((node) => {
      const submissionId = submittedMessageId(node)
      return submissionId === undefined
        ? node
        : withAnnotations(node, this.annotations(submissionId))
    })
  }

  /**
   * Reconcile annotation summaries affected by incremental node changes.
   * @param upserts - newly projected or changed Chat nodes.
   * @param store - existing nodes available for annotation association.
   * @returns changed nodes and any submitted messages affected by their annotations.
   */
  apply(
    upserts: readonly ChatConversationViewNode[],
    store: ChatNodeStore,
  ): readonly ChatConversationViewNode[] {
    const byKey = new Map(upserts.map(node => [node.key, node]))
    const affected = new Set<string>()
    for (const node of upserts) {
      const messageId = submittedMessageId(node)
      if (messageId !== undefined) affected.add(messageId)
      const annotation = annotationContext(node)
      if (annotation !== undefined) affected.add(annotation.submissionId)
      this.record(node)
    }
    for (const submissionId of affected) {
      const key = this.messagesBySubmissionId.get(submissionId)
      if (key === undefined) continue
      const node = byKey.get(key) ?? store.get(key)
      if (node !== undefined) {
        byKey.set(key, withAnnotations(node, this.annotations(submissionId)))
      }
    }
    return [...byKey.values()]
  }

  private record(node: ChatConversationViewNode): void {
    const submissionId = submittedMessageId(node)
    if (submissionId !== undefined) this.messagesBySubmissionId.set(submissionId, node.key)
    const annotation = annotationContext(node)
    if (annotation === undefined) return
    const annotations = this.annotationsBySubmissionId.get(annotation.submissionId) ?? new Map<string, PromptAnnotation>()
    annotations.set(node.key, annotation.annotation)
    this.annotationsBySubmissionId.set(annotation.submissionId, annotations)
  }

  private annotations(submissionId: string): readonly PromptAnnotation[] {
    const annotations = this.annotationsBySubmissionId.get(submissionId)
    return annotations === undefined ? EMPTY_ANNOTATIONS : [...annotations.values()]
  }
}
