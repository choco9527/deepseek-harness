# Agent Note: Preset host resolution

Status: implemented

English | [中文](2026-09-08-preset-host-resolution.zh.md)

## Problem

Preset discovery can reject packages supplied by a host resolver when the profile has no physical dependency tree.

## Decision

Discovery retains the installed-package lookup and uses parent-aware CommonJS resolution when that lookup misses. Resolution does not execute plugin code. The core owns no product name or archive format.

## Alternatives considered

**Import plugins during discovery.** This executes effects while listing presets. **Disable health checks.** This admits genuinely missing plugins. **Copy all host dependencies beside the profile.** This duplicates the host's installed runtime.

## Consequences

Host resolution and ordinary missing-package rejection are tested together, including resolver restoration. ESM-only hooks without a matching CommonJS resolver remain unsupported. Physical package presence remains a conservative check rather than proof that mounting succeeds.
