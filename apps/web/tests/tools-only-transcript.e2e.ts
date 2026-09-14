/** Replay a committed Session through the configured Web composition without model calls. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/fresh-round-trip/session.v3.jsonl', import.meta.url))
const OVERLAY = fileURLToPath(new URL('./tools-only-transcript.overlay.yml', import.meta.url))

describe('web e2e: application-owned tool folding', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await seedSession(scaffold, await readFile(FIXTURE, 'utf8'), 'tools-only-transcript')
    const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.setViewportSize({ width: 1800, height: 900 })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const group = page.locator('[role="treeitem"]').first()
    await group.waitFor({ timeout: 30_000 })
    if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
    await page.locator('[role="treeitem"]').nth(1).click()
    await page.getByText('DONE', { exact: true }).waitFor({ timeout: 15_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the recorded answer and lets the aggregate toggle hide only tools', async () => {
    const toggle = page.locator('button[data-turn-process]')
    await toggle.waitFor({ timeout: 15_000 })
    expect(await toggle.getAttribute('aria-expanded')).toBe('false')
    expect(await toggle.getAttribute('data-turn-process-messages')).toBeNull()
    const state = () => page.locator('[data-chat-flow-kind]').evaluateAll(rows => ({
      hiddenKinds: rows.filter(row => row.hasAttribute('hidden') && row.getAttribute('data-chat-flow-kind') !== 'turn-process')
        .map(row => row.getAttribute('data-chat-flow-kind')),
      visibleReplies: rows.filter(row => row.getAttribute('data-chat-flow-kind') === 'assistant-step'
        && !row.hasAttribute('hidden')).length,
    }))
    const folded = await state()
    expect(folded.hiddenKinds).toEqual(['tool-call'])
    expect(folded.visibleReplies).toBeGreaterThan(0)
    const originalOrder = await page.locator('[data-chat-flow-key]').evaluateAll(rows => rows.map(row => row.getAttribute('data-chat-flow-key')))
    await toggle.click()
    expect((await state()).hiddenKinds).toEqual([])
    await toggle.click()
    expect(await state()).toEqual(folded)
    expect(await page.getByText('DONE', { exact: true }).isVisible()).toBe(true)
    expect(await page.locator('[data-chat-flow-key]').evaluateAll(rows => rows.map(row => row.getAttribute('data-chat-flow-key'))))
      .toEqual(originalOrder)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
