# Agent Note: Plugin-owned draft submission contexts

Status: implemented

English | [中文](2026-09-03-draft-submission-contexts.zh.md)

## Problem

A browser plugin could add selected text to a prompt only by inserting a Lexical reference chip. Hiding that chip preserved its serialization but made keyboard deletion act on invisible content, and placing the plugin's visual control beside image attachments did not change the editor's ownership.

## Decision

`ui-conversation` owns `DraftContextRegistry`. A client plugin registers one session-addressed source, keeps its own items outside Lexical, and transfers them only when the ordinary composer starts a detached send. The capture settles once: accepted prompts retire the items, while rejected prompts and scope disposal return them to their source.

The session prompt RPC carries text-only `PromptContext` entries. `dsh-session-controller` validates and stores them in the pending user message's `source.contexts`. Its `agent/pre-step` listener delegates first, then expands accepted prompts into plugin-source messages followed by the correlated user message without the pending context field. Context and prompt share one durable inbox occurrence through edits, removal, steering, cancellation, and replay. Context-only submissions retain an empty user message for correlation. The model sees the context only when its own prompt is admitted. Subagent transport rejects draft contexts instead of silently omitting them.

An annotation context records `form: 'annotation'` and the request id as `submissionId`. Chat joins those durable context messages to the user or steering message whose `source.rpcId` has that id, hides the standalone context rows, and presents the selected text above the submitted message.

The released v0/v1 migration validates and preserves annotation sources in both inbox entries and surface messages. An annotation requires a non-empty `submissionId`; other plugin forms reject that field. Discarding the identity would break the transcript association. The existing adjacent migration transaction writes only a version-named successor and retains committed predecessors unchanged.

`dsh-add-to-chat` is the first consumer. It keeps selected assistant text in its own per-session list, renders the list next to the composer attachment area, and no longer registers an input-trigger codec or a Lexical chip.

## Alternatives considered

**Hide the Lexical chip with CSS.** Rejected: the editor still owns the hidden node, so Backspace and Delete can change unseen plugin state.

**Concatenate plugin text with the user's draft.** Rejected: the source becomes indistinguishable from user-authored text and the session log loses plugin provenance.

**Inject context separately before enqueuing the prompt.** Rejected: `inject()` targets the next step, while `followup()` targets the next turn; active work can consume a later prompt's context, and removing that prompt cannot retract it.

**Inject text when the user selects it.** Rejected: a selection must remain removable and must not wake or affect a later turn until the user submits it.

**Give one integration a private submit path.** Rejected: independently installed DSH plugins need the same lifecycle and logged provenance.

## Consequences

Plugins can provide removable non-file composer context without mutating the user's editor content. A plugin needs the DSH version that exposes `conversation.draftContexts`; older runtimes fail plugin activation clearly. The core RPC exposes text only, leaving binary attachment ownership with the existing attachment service.

## Verification

The session-controller real-loop specs verify per-turn context ownership, context-only admission, queue removal/edit/steering, retry deduplication, and restoration from serialized pending events. The composer spec verifies an empty editor can submit context, leaves no occurrence in the editor, and restores the source on rejection. The Chat node and renderer specs verify annotation aggregation, hidden context rows, and selected-text disclosure. The add-to-chat browser asset passes `node --check`.
