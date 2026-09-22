/** Chat-owned per-Session view state. */

/** Tool call identity as carried by Chat nodes. */
export type ToolCallId = string

/** One manually expanded Turn; a null answer Step identifies its answerless process. */
export interface TurnProcessViewEntry {
  readonly turn: number
  readonly answerStep: number | null
}

/** Per-Session state shared only by the Chat view and details surface. */
export interface ChatStoreState {
  turnProcesses: TurnProcessViewEntry[]
}
