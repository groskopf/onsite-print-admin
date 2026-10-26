import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchCollection } from '../src/api.js'

test('loads a collection and forwards cancellation', async (context) => {
  const records = [{ code: 'ABCDEFGH234567AB', name: 'Conference' }]
  const signal = new AbortController().signal
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json(records))
  assert.deepEqual(await fetchCollection('events', signal), records)
  assert.deepEqual(fetchMock.mock.calls[0].arguments, [
    '/api/v2/events/', { headers: { Accept: 'application/json' }, signal },
  ])
})

test('reports backend error details', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ detail: 'Database unavailable' }, { status: 503 }))
  await assert.rejects(fetchCollection('nametag_types'), /Unable to load nametag types \(503\): Database unavailable/)
})

test('reports non-JSON backend failures', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }))
  await assert.rejects(fetchCollection('printers'), /Unable to load printers \(502\): Bad Gateway/)
})

test('rejects malformed collections', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ events: [] }))
  await assert.rejects(fetchCollection('events'), /unexpected response/)
})
