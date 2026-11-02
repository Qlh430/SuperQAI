import test from 'node:test'
import assert from 'node:assert/strict'
import { openDailyWorkbench } from './open-daily-workbench.mjs'

test('repeat launch opens the verified existing frontend without starting another process', async () => {
  const calls = []
  const result = await openDailyWorkbench({
    upstream: 'http://127.0.0.1:3199',
    request: async url => url.endsWith('/api/system/ready')
      ? { ok: true, json: async () => ({ ok: true, pid: 42 }) }
      : { ok: true, headers: new Headers({ 'X-AI-OS-Frontend': 'fixed-stage' }) },
    listening: async () => true,
    open: () => calls.push('open'), start: () => calls.push('start'),
  })
  assert.equal(result, 'reused')
  assert.deepEqual(calls, ['open'])
})

test('an unrelated occupied port is never opened or terminated', async () => {
  await assert.rejects(openDailyWorkbench({ upstream: 'http://127.0.0.1:3199', listening: async () => true,
    request: async () => ({ ok: true, headers: new Headers() }),
    open: () => assert.fail('must not open'), start: () => assert.fail('must not start'),
  }), /33200.*其他/)
})

test('a free port starts the existing daily Vite entry once', async () => {
  let starts = 0
  assert.equal(await openDailyWorkbench({ listening: async () => false, start: () => starts++, open: () => assert.fail('Vite opens browser') }), 'started')
  assert.equal(starts, 1)
})

test('a stale frontend proxy is not silently reused', async () => {
  await assert.rejects(openDailyWorkbench({ upstream: 'http://127.0.0.1:3199', listening: async () => true,
    request: async url => url.endsWith('/api/system/ready')
      ? { ok: true, json: async () => ({ ok: true, pid: url.includes(':3199') ? 42 : 43 }) }
      : { ok: true, headers: new Headers({ 'X-AI-OS-Frontend': 'fixed-stage' }) },
    open: () => assert.fail('must not open'), start: () => assert.fail('must not start'),
  }), /后端/)
})
