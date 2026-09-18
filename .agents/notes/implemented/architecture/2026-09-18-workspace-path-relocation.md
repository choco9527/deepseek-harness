# Agent Note: Explicit startup workspace path relocation

Status: implemented

English | [中文](2026-09-18-workspace-path-relocation.zh.md)

## Problem

Desktop product-directory changes must preserve workspace identity and session grouping. A filesystem alias alone changes canonical session cwd while the workspace record retains its original canonical path, so its recorded sessions become filtered out. Rewriting released session generations would violate their immutability.

## Decision

The workspace plugin accepts explicit host-owned `pathRelocations` at startup. The host finishes physical relocation, retains aliases, and excludes other writers before starting the registry. Both paths must resolve to the same directory. The registry resolves descendants with the most-specific mapping, validates every resulting path for collisions before writing, and updates only affected records before indexing session headers and publishing entities. Workspace IDs, session accounts, registry order, and archive state remain intact. Each record write is atomic; restarting resumes partial updates without resetting already updated records.

This narrowly extends path handling in the [domain storage proposal](../../proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md); the storage design and ownership-account rationale remain independent. The [workspace README](../../../../packages/workspace/workspace/README.md) owns configuration and failures.

## Alternatives considered

**Aliases alone:** canonical session cwd changes but stored workspace paths do not, hiding history from grouping.

**Rewrite session logs:** changes immutable recorded history and can invalidate physical log addressing. Retained aliases keep both recorded cwd and artifact references usable without rewriting logs.

**Infer relocation from missing paths:** cannot distinguish deliberate migration from temporarily unavailable storage. Only explicit, physically verified mappings change metadata.

## Consequences

The host retains ownership of shutdown, filesystem migration, locking, and alias lifetime. The registry does not merge conflicting workspaces or provide runtime directory moves. No domain or Session format version changes because record fields and event bytes are unchanged.

## Verification

Workspace tests cover identity, order, archives, nested paths, conflict rejection, explicit opt-in, restart idempotency, and interrupted record writes. A real Loader composition using JSON storage and JSONL persistence reopens a recorded session after directory relocation and verifies unchanged log bytes. Packaged Desktop startup and Windows junction behavior require their own host acceptance.
