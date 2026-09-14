# Agent Note: Application-owned tool folding

Status: implemented

English | [中文](2026-09-14-application-owned-tool-folding.zh.md)

## Problem

Compact Chat can hide a useful Assistant reply when later tool work produces another reply in the same Turn. Applications that require every reply to remain visible cannot solve this by replacing the Assistant renderer: its enclosing Chat Node Seat owns visibility.

## Decision

An opt-in `ui-chat` configuration, `toolsOnlyTranscript`, restricts completed-Turn folding to Tool nodes, leaves messages in their original order, and omits message counts from the disclosure. It hides the preference selector and ignores durable mode preferences without migrating or overwriting them. The default remains upstream Normal/Compact behavior. Conversation projection, Session events, and provider requests are unchanged.

The existing final-answer, closed-Turn, and complete-history requirements remain. Search and keyboard-focus reveal still expand hidden tools. Reasoning keeps its own renderer disclosure and is not hidden by the tool toggle.

Host plugin configuration is not implicitly forwarded by the client module graph. The Host publishes only this public policy through `webserver/index-inject`; the browser validates the bootstrap value before registering Chat. A recorded-Session browser replay covers this transport as well as tool visibility, since direct client mounts cannot detect a missing Host-to-browser handoff.

## Alternatives considered

- A replacement Assistant renderer cannot bypass its hidden ancestor.
- CSS overrides would couple applications to private layout details and leave preference behavior inconsistent.
- A third persisted mode would require migrating user choices even though the application owns this policy.

## Consequences

Applications gain fixed presentation through composition instead of a downstream transcript fork. They retain a small core configuration dependency across upgrades. Integration coverage must check mixed prose/tool order, tools-only counts, old preferences, partial history, live completion, and unchanged upstream behavior.
