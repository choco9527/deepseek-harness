# Agent Note: Full-window settings page

Status: implemented

English | [中文](2026-09-04-full-window-settings-page.zh.md)

## Problem

The centered settings dialog constrained feature-owned pages to a narrow content column. Wide settings such as tables lost readable columns and forced vertical content to compete with dialog chrome.

## Decision

When the host selects `presentation: page`, the settings shell presents a full-window page with a fixed navigation column and a content column that takes the remaining width. A visible **Back to app** action and Escape return to the application, while background clicks have no navigation effect. Settings sections continue to use the existing slot ledger and receive the same `close()` operation for flows that leave settings.

The [host-owned presentation decision](../architecture/2026-09-06-host-owned-ui-presentation.md) makes this layout opt-in and keeps the generic modal available; the page geometry and section ownership remain unchanged.

## Alternatives considered

**Keep the centered dialog and increase its maximum width.** This retained a modal presentation but still coupled every section to viewport margins and dialog geometry.

**Make only wide feature pages escape the dialog width.** This made layout behavior feature-specific and forced plugins to reach beyond the settings shell they do not own.

## Consequences

All settings sections receive stable horizontal space and one return path without changing their registration API. The page temporarily replaces the application content, so it no longer provides click-outside dismissal or a compact modal context.
