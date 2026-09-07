# Agent Note: Host-owned UI presentation

Status: implemented

English | [中文](2026-09-06-host-owned-ui-presentation.zh.md)

## Problem

Hardcoded visibility and a single settings layout make reusable client packages depend on one host's product choices. Maintaining host-specific source edits also increases conflicts when those packages evolve.

## Decision

Client plugins own generic display options, while composition profiles supply product defaults. The existing Host settings provider and Client settings mirror carry those values without a second configuration transport. Schema defaults keep statistics, command launchers, session search and grouping controls visible. Explicit saved fields override the profile base, including the transcript preference. These values control presentation, not access to commands, accounting, search or stored grouping.

The settings shell supports `modal` and `page` with shared navigation, content slots and viewing state. Its default is `modal`; the [full-window page decision](../feature/2026-09-04-full-window-settings-page.md) continues to govern the opt-in page layout. The close-label slot receives the presentation so registrants can distinguish dismissal from returning to the application.

Brand names, service endpoints, installed business bundles and product-specific defaults belong in the composing application, not generic client packages. Minimal transcripts, annotations, submission contexts and session renaming remain independently usable capabilities.

## Alternatives considered

**Keep host-specific source patches or CSS hiding.** These obscure the supported defaults and couple host maintenance to component internals.

**Create a second settings shell or configuration transport.** Existing section slots and the settings mirror already provide content composition, validation and reconnect behavior. Duplicating them adds lifecycle and focus ownership without another consumer need.

## Consequences

Profiles can select a presentation without replacing components. Controls wait for the initial settings read to avoid exposing a different default during connection startup. Non-loopback clients retain the existing memory-only preference behavior and generic defaults. Cosmetic settings are not security policy; an explicit user document may override profile defaults. Host composition tests verify default and configured values, validation and existing-user precedence; component tests verify visibility and both settings close paths.
