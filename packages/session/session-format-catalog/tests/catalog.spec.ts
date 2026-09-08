import { describe, expect, it } from 'vitest'
import { sessionFormatCatalog } from '../src/index.ts'

describe('first-party Session format catalog', () => {
  it('preserves submitted annotation identity through the complete released migration chain', () => {
    const source = { kind: 'plugin', plugin: 'context-provider', form: 'annotation', submissionId: 'request-1' }
    const message = { id: 'context-1', role: 'user', content: [{ type: 'text', text: 'selected context' }], source }
    const restore = sessionFormatCatalog.createRestore({
      type: 'session', version: 0, id: 'annotations', createdAt: 1, delegationDepth: 0,
    }, { recovery: 'strict', validation: 'current' })
    restore.decodeRow({ type: 'agent/inbox/spliced', seq: 0, time: 1, data: { target: 'next-turn', start: 0, inserted: [message] } })
    restore.decodeRow({ type: 'turn/start', seq: 1, time: 2, data: { turn: 1 } })
    restore.decodeRow({ type: 'user/message', seq: 2, time: 3, surfaceOp: 'append', data: message })
    restore.decodeRow({ type: 'turn/end', seq: 3, time: 4, data: { turn: 1, reason: { kind: 'completed' } } })
    const result = restore.finish()
    expect(result.header.version).toBe(2)
    expect(result.events[2]?.data).toEqual(message)
  })

  it('statically owns the complete adjacent v0 to v2 chain', () => {
    const header = {
      type: 'session',
      version: 0,
      id: 'catalog',
      createdAt: 1,
      seedLength: 0,
      delegationDepth: 0,
    }

    expect(sessionFormatCatalog.currentVersion).toBe(2)
    expect(sessionFormatCatalog.readHeader(header)).toEqual({
      status: 'migration-required',
      storedVersion: 0,
      targetVersion: 2,
      header: {
        version: 2,
        id: 'catalog',
        createdAt: 1,
        isSeeded: true,
        delegationDepth: 0,
      },
    })

    const v1Header = { ...header, version: 1 }
    const restore = sessionFormatCatalog.createRestore(v1Header, {
      recovery: 'strict', validation: 'current',
    })
    restore.decodeRow({ type: 'turn/start', seq: 0, time: 2, data: { turn: 1 } })
    expect(restore.finish()).toMatchObject({
      header: { version: 2, id: 'catalog' },
    })
  })

  it('restores the installed current vocabulary without freezing ordinary payload additions', () => {
    const header = {
      type: 'session', version: 2, id: 'current-growth', createdAt: 1, isSeeded: false, delegationDepth: 0,
    }
    const restore = (rows: readonly unknown[]) => {
      const current = sessionFormatCatalog.createRestore(header, {
        recovery: 'strict', validation: 'current',
      })
      for (const row of rows) current.decodeRow(row)
      return current.finish()
    }
    const extended = restore([{
      type: 'turn/start', seq: 0, time: 1, data: { turn: 1, postReleaseMember: true },
    }])
    expect(extended.events).toEqual([{
      type: 'turn/start', seq: 0, time: 1, data: { turn: 1, postReleaseMember: true },
    }])

    expect(() => restore([{
      type: 'ordinary/not-installed', seq: 0, time: 1, data: 'future',
    }])).toThrow(/unknown event type/)

    const extension = restore([{
      type: 'ordinary/external', seq: 0, time: 1, data: null, ignorable: true,
    }])
    expect(extension.events).toEqual([{
      type: 'ordinary/external', seq: 0, time: 1, data: null, ignorable: true,
    }])
  })

  it('validates complete relationships after streaming migration', () => {
    const stream = sessionFormatCatalog.createRestore({
      type: 'session', version: 1, id: 'invalid-stream', createdAt: 1, delegationDepth: 0,
    }, { recovery: 'strict', validation: 'current' })
    stream.decodeRow({ type: 'step/start', seq: 0, time: 2, data: { turn: 1, step: 1 } })

    expect(() => stream.finish()).toThrow(/open turn/)
  })
})
