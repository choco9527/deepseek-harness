/** Replay a committed Session through the configured Web composition without model calls. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'
import { createChatScrollFixture } from './chat-scroll-fixture.ts'

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

  it('renders the recorded answer and lets the aggregate toggle hide tools and context', async () => {
    const toggle = page.locator('button[data-turn-process]')
    await toggle.waitFor({ timeout: 15_000 })
    expect(await toggle.getAttribute('aria-expanded')).toBe('false')
    expect(await toggle.getAttribute('data-turn-process-messages')).toBeNull()
    expect(await toggle.getAttribute('data-turn-process-contexts')).toBe('1')
    const state = () => page.locator('[data-chat-flow-kind]').evaluateAll(rows => ({
      hiddenKinds: rows.filter(row => row.hasAttribute('hidden') && row.getAttribute('data-chat-flow-kind') !== 'turn-process')
        .map(row => row.getAttribute('data-chat-flow-kind')),
      visibleReplies: rows.filter(row => row.getAttribute('data-chat-flow-kind') === 'assistant-step'
        && !row.hasAttribute('hidden')).length,
    }))
    const folded = await state()
    expect(folded.hiddenKinds).toEqual(['context', 'tool-call'])
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

  it('folds completed tools before loading earlier history and retains manual expansion after prepend', async () => {
    const fixture = createChatScrollFixture({ markerPrefix: 'PAGED_FOLD', title: 'PAGED_FOLD', turns: 32 })
    await seedSession(scaffold, fixture.log, 'tools-only-paged')
    await page.reload({ waitUntil: 'load' })
    const searchButton = page.getByRole('button', { name: 'Search sessions' })
    if (await searchButton.getAttribute('aria-expanded') !== 'true') await searchButton.click()
    await page.getByRole('textbox', { name: 'Search sessions...', exact: true }).fill(fixture.markers.user(1))
    await page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem').click({ timeout: 30_000 })
    await page.getByText(fixture.markers.assistant(32), { exact: false }).waitFor({ timeout: 15_000 })
    const earlier = page.getByRole('button', { name: 'Load earlier', exact: true })
    expect(await earlier.count()).toBe(1)
    const tools = page.locator('[data-chat-turn="32"][data-chat-flow-kind="tool-call"]')
    const toggle = page.locator('[data-chat-turn="32"] button[data-turn-process]')
    await toggle.waitFor({ timeout: 15_000 })
    expect(await tools.count()).toBe(2)
    expect(await tools.evaluateAll(rows => rows.every(row => row.getAttribute('hidden') === 'until-found'))).toBe(true)
    await toggle.click()
    expect(await toggle.getAttribute('aria-expanded')).toBe('true')
    await earlier.click()
    await expect.poll(() => earlier.count()).toBe(0)
    expect(await toggle.getAttribute('aria-expanded')).toBe('true')
    expect(await tools.evaluateAll(rows => rows.every(row => !row.hasAttribute('hidden')))).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })

  it.each(['aborted', 'error', 'completed'] as const)('folds recorded work without a final answer after %s and reload', async (ending) => {
    const title = `ANSWERLESS_${ending}`
    const rows = (await readFile(FIXTURE, 'utf8')).trim().split('\n')
      .map(line => JSON.parse(line) as { type: string; data?: { step?: number; [key: string]: unknown } })
      .filter(row => row.type !== 'assistant/message' || row.data?.step !== 2)
      .map(row => row.type === 'session/title' ? { ...row, data: { ...row.data, title } }
        : row.type === 'user/message' && (row.data?.source as { kind: string }).kind === 'user'
          ? { ...row, data: { ...row.data, content: [{ type: 'text', text: title }] } }
          : row.type === 'turn/end' ? { ...row, data: { ...row.data, reason: ending === 'aborted'
            ? { kind: 'aborted', reason: { kind: 'user' } }
            : ending === 'error' ? { kind: 'error', error: { code: 'TRANSPORT', message: 'fixture failure' } }
              : { kind: 'completed' } } } : row)
    await seedSession(scaffold, rows.map(row => JSON.stringify(row)).join('\n') + '\n', title)
    await page.reload({ waitUntil: 'load' })
    const searchButton = page.getByRole('button', { name: 'Search sessions' })
    if (await searchButton.getAttribute('aria-expanded') !== 'true') await searchButton.click()
    await page.getByRole('textbox', { name: 'Search sessions...', exact: true }).fill(title)
    await page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem').click({ timeout: 30_000 })
    const toggle = page.locator('button[data-turn-process="1"]')
    const rowsState = () => page.locator('[data-chat-flow-kind="context"], [data-chat-flow-kind="tool-call"]')
      .evaluateAll(nodes => nodes.map(node => ({ kind: node.getAttribute('data-chat-flow-kind'), hidden: node.getAttribute('hidden') })))
    const folded = [{ kind: 'context', hidden: 'until-found' }, { kind: 'tool-call', hidden: 'until-found' }]
    await toggle.waitFor({ timeout: 15_000 })
    expect(await rowsState()).toEqual(folded)
    expect(await page.getByText('DONE', { exact: true }).count()).toBe(0)
    await toggle.click()
    expect((await rowsState()).every(row => row.hidden === null)).toBe(true)
    await page.reload({ waitUntil: 'load' })
    await toggle.waitFor({ timeout: 15_000 })
    expect(await toggle.getAttribute('aria-expanded')).toBe('false')
    expect(await rowsState()).toEqual(folded)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
