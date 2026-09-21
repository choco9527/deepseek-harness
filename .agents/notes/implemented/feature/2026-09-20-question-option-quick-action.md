# Agent Note: Explicit question option continuation

Status: implemented

English | [中文](2026-09-20-question-option-quick-action.zh.md)

## Problem

Users need to answer a single-choice question without moving to the footer, while retaining the ability to inspect or change a selection before sending it.

## Decision

Single-choice options advance immediately on earlier questions. On the final question, option text only changes the selection, while a sibling Submit button selects that option and submits after checking all answers. This text button has a filled background and is visible on row hover or focus, or always without hover support. Multi-select, free text, and plan-review decisions retain their existing submission controls.

## Alternatives considered

**Double-clicking the option** is less discoverable and conflates selection with submission. A labeled, keyboard-accessible button makes the action explicit.

**An arrow on every question** adds an unnecessary action before the final question. A Submit label on the final question states the operation directly.

**Submitting on every selection** removes the opportunity to revise an answer. It also cannot express a completed multi-select answer.

## Consequences

The reserved action space prevents text movement. Separate sibling buttons avoid nested interactive elements. Submission uses the clicked option's new draft, rejects incomplete batches, blocks duplicate sends while pending, and retains drafts on failure. The host answer format and model tools are unchanged.
