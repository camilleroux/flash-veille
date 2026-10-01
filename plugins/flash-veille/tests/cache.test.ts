import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.UTC(2026, 9, 1, 18, 0)
const CACHED = { id: 'hc:1', source: 'hc', title: 'Déjà en cache', url: 'https://x.dev/1', at: NOW - 3_600_000 }
const FEED = `<rss><channel><item><title>Tout frais</title><link>https://x.dev/2</link>
<pubDate>Thu, 01 Oct 2026 17:59:00 +0000</pubDate><guid>2</guid></item></channel></rss>`

for (const [label, age, fetches] of [
  ['reuses the feeds another session fetched minutes ago', 5 * 60_000, 0],
  ['fetches the feeds again once the shared cache is stale', 20 * 60_000, 1],
] as const) {
  test(label, { options: { sources: 'hc', keywords: '', keywordsOnly: false, rotationSeconds: 12 } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    mock.store(on, { items: { items: [CACHED], fetchedAt: NOW - age, sourceIds: ['hc'] } })
    let fetched = 0
    on('http.fetch', async () => {
      fetched += 1
      return { value: { status: 200, ok: true, headers: {}, text: FEED } }
    })
    on('command.register', async () => ({ value: { command: 'veille' } }))
    on('session.start', async (_, e) => ({ cwd: e.cwd, startedAt: 0 }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await clock.settle()

    expect(fetched).toBe(fetches)
    const band = await $.ui.mount({
      plugin: 'flash-veille',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 1 }, view: {} },
    })
    expect(await band.find({ type: 'Link', text: fetches ? /Tout frais/ : /Déjà en cache/ })).toBeDefined()
  })
}
