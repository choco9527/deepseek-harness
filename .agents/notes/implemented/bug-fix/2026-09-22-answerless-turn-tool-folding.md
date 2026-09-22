# Agent Note: Answerless Turn tool folding

Status: implemented

English | [中文](2026-09-22-answerless-turn-tool-folding.zh.md)

## Problem

Stopped and failed Turns can end without a final Assistant reply. Requiring that reply for application-owned folding leaves Tool and Context rows expanded after the Turn closes, despite the application's fixed presentation policy.

## Decision

The [application-owned policy](../feature/2026-09-14-application-owned-tool-folding.md) uses closed-Turn status without requiring a final answer. An answerless process starts at the recorded Turn start when available, including Context entries before the first tool. Its manual expansion uses a null answer Step in the session-scoped UI store; an eventual numbered answer remains a separate expansion generation.

Only Tool and Context rows fold. Assistant prose, independent interaction cards, errors, and the System prompt remain visible. Open Turns and upstream Normal/Compact behavior are unchanged. No Session events, model requests, or durable data are rewritten.

## Alternatives considered

- Fabricating a final reply would misrepresent the recorded conversation.
- Removing the answer requirement globally would alter upstream Compact behavior.
- Hiding the entire Turn would hide interactive cards and failure evidence.

## Consequences

Existing answerless history gains the same collapsed default without migration. Regression coverage must include stopped, failed, and completed answerless Turns, contexts before tools, manual expansion, history reload, independent interaction cards, and the unchanged upstream modes.
