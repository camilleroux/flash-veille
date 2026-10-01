import { describe, expect, mock, test } from 'claude-code/testing'

import {
  byKeywords,
  columns,
  fit,
  matchesKeywords,
  merge,
  parseDate,
  parseFeed,
  parseIsoDate,
  parseKeywords,
  pickSources,
} from '../hooks/feeds'
import { revealFrame } from '../hooks/transition'

describe('transition', () => {
  test('types the title left to right behind a discreet cursor, at constant length', () => {
    expect(revealFrame('abcdefghij', 0, 10)).toBe('·         ')
    expect(revealFrame('abcdefghij', 5, 10)).toBe('abcde·    ')
    expect(revealFrame('abcdefghij', 9, 10)).toBe('abcdefghi·')
    expect(revealFrame('abcdefghij', 10, 10)).toBe('abcdefghij')
  })
})

const HC = `<rss><channel><item>
  <title>PrettyTable, une bibliothèque Python</title>
  <description><![CDATA[<p>blabla</p>]]></description>
  <link>https://github.com/prettytable/prettytable</link>
  <comments>https://news.humancoders.com/t/python/items/67082#comments</comments>
  <pubDate>Thu, 01 Oct 2026 16:50:00 +0000</pubDate>
  <guid isPermaLink="false">67082</guid>
</item></channel></rss>`

const JDH = `<rss><channel><item>
  <title>Docker Agent, beaucoup d&#39;agents</title>
  <link>https://jtama.github.io/posts/docker-agent/</link>
  <guid isPermaLink="false">https://www.journalduhacker.net/s/j3sgnv</guid>
  <pubDate>Wed, 30 Sep 2026 08:38:45 +0200</pubDate>
  <comments>https://www.journalduhacker.net/s/j3sgnv/docker</comments>
</item></channel></rss>`

const BSKY = `<rss><channel><item><link>https://bsky.app/profile/camilleroux.com/post/3mwta</link><description>Firefox 157 déploie son nouveau design. ⬇️&#xA;https://blog.mozilla.org/fr/firefox-fr/le-nouveau-design/&#xA;&#xA;📬 Recevoir ma veille</description><pubDate>01 Oct 2026 18:00 +0200</pubDate><guid isPermaLink="false">at://did/3mwta</guid></item></channel></rss>`

const SIMONW = `<feed xmlns="http://www.w3.org/2005/Atom"><link href="http://simonwillison.net/" rel="alternate"/>
<entry><title>Matthew Green on passkeys</title><link href="https://simonwillison.net/2026/Oct/1/matthew-green/" rel="alternate"/>
<published>2026-10-01T06:29:01+00:00</published><id>tag:simonwillison.net,2026:1</id></entry></feed>`

const RELEASES = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
<id>tag:github.com,2008:Repository/937253475/v2.1.287</id><updated>2026-10-01T18:43:19Z</updated>
<link rel="alternate" type="text/html" href="https://github.com/anthropics/claude-code/releases/tag/v2.1.287"/>
<title>v2.1.287</title>
<content type="html">&lt;h2&gt;What&#39;s changed&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Added Claude Mods: plugins may now modify deeper behavior&lt;/li&gt;&lt;li&gt;Other&lt;/li&gt;</content>
</entry></feed>`

describe('feeds', () => {
  test('parses RFC 822 dates with offsets', () => {
    expect(parseDate('Thu, 01 Oct 2026 16:50:00 +0000')).toBe(Date.UTC(2026, 9, 1, 16, 50))
    expect(parseDate('01 Oct 2026 18:00 +0200')).toBe(Date.UTC(2026, 9, 1, 16, 0))
  })

  test('reads Human Coders and Journal du hacker items', () => {
    const [hc] = parseFeed(HC, 'hc')
    expect(hc?.title).toBe('PrettyTable, une bibliothèque Python')
    expect(hc?.url).toBe('https://github.com/prettytable/prettytable')
    expect(hc?.discussUrl).toBe('https://news.humancoders.com/t/python/items/67082')
    const [jdh] = parseFeed(JDH, 'jdh')
    expect(jdh?.title).toBe("Docker Agent, beaucoup d'agents")
    expect(jdh?.discussUrl).toBe('https://www.journalduhacker.net/s/j3sgnv/docker')
  })

  test('turns a Bluesky post into a title and the link it shares', () => {
    const [post] = parseFeed(BSKY, 'camille')
    expect(post?.title).toBe('Firefox 157 déploie son nouveau design.')
    expect(post?.url).toBe('https://blog.mozilla.org/fr/firefox-fr/le-nouveau-design/')
    expect(post?.discussUrl).toBe('https://bsky.app/profile/camilleroux.com/post/3mwta')
  })

  test('merges newest first and drops duplicate links', () => {
    const a = { id: 'a', source: 'hc' as const, title: 'A', url: 'https://x.dev/a/', at: 1 }
    const b = { id: 'b', source: 'camille' as const, title: 'B', url: 'https://x.dev/a', at: 2 }
    const c = { id: 'c', source: 'jdh' as const, title: 'C', url: 'https://x.dev/c', at: 3 }
    expect(merge([[a, c], [b]]).map(it => it.id)).toEqual(['c', 'a'])
  })

  test('counts emoji and wide characters as two columns', () => {
    expect(columns('abc')).toBe(3)
    expect(columns('📰 VEILLE')).toBe(9)
    expect(columns('⬇️')).toBe(2)
  })

  test('fits a title in a number of columns', () => {
    expect(fit('court', 10)).toBe('court')
    expect(fit('un titre bien trop long', 10)).toBe('un titre…')
    expect(columns(fit('🚀🚀🚀🚀🚀🚀', 7))).toBeLessThanOrEqual(7)
  })

  test('parses ISO 8601 dates of Atom feeds', () => {
    expect(parseIsoDate('2026-10-01T18:43:19Z')).toBe(Date.UTC(2026, 9, 1, 18, 43, 19))
    expect(parseIsoDate('2026-10-01T08:29:01+02:00')).toBe(Date.UTC(2026, 9, 1, 6, 29, 1))
  })

  test('reads Atom entries, naming a Claude Code release by its first change', () => {
    const [post] = parseFeed(SIMONW, 'simonw')
    expect(post?.title).toBe('Matthew Green on passkeys')
    expect(post?.url).toBe('https://simonwillison.net/2026/Oct/1/matthew-green/')
    const [release] = parseFeed(RELEASES, 'claudecode')
    expect(release?.title).toBe('Claude Code v2.1.287 : Added Claude Mods: plugins may now modify deeper behavior')
    expect(release?.url).toBe('https://github.com/anthropics/claude-code/releases/tag/v2.1.287')
    expect(release?.at).toBe(Date.UTC(2026, 9, 1, 18, 43, 19))
  })
})

describe('options', () => {
  test('picks the known sources, whatever the case or spacing', () => {
    expect(pickSources(' HC,anthropic , inconnue').map(s => s.id)).toEqual(['hc', 'anthropic'])
    expect(pickSources('')).toEqual([])
  })

  test('matches keywords as words, without case or accents', () => {
    const kw = parseKeywords('IA, sécurité')
    expect(matchesKeywords("L'IA générative", kw)).toBe(true)
    expect(matchesKeywords('Faille de securite', kw)).toBe(true)
    expect(matchesKeywords('Une piano mécanique', kw)).toBe(false)
  })

  test('puts keyword items first, or keeps only them', () => {
    const a = { id: 'a', source: 'hc' as const, title: 'Rails 9', url: 'https://x.dev/a', at: 3 }
    const b = { id: 'b', source: 'hc' as const, title: 'Python 4', url: 'https://x.dev/b', at: 2 }
    expect(byKeywords([a, b], ['python'], false).map(i => i.id)).toEqual(['b', 'a'])
    expect(byKeywords([a, b], ['python'], true).map(i => i.id)).toEqual(['b'])
    expect(byKeywords([a, b], [], true).map(i => i.id)).toEqual(['a', 'b'])
  })
})

const FEEDS: Record<string, string> = {
  'https://news.humancoders.com/items/feed.rss': HC,
  'https://www.journalduhacker.net/rss': JDH,
  'https://bsky.app/profile/camilleroux.com/rss': BSKY,
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws the three sources in a pane and filters them (${surface})`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 1, 18, 0) })
    mock.store(on)
    on('http.fetch', async (_, e) => ({
      value: { status: 200, ok: true, headers: {}, text: FEEDS[e.url] ?? '' },
    }))
    on('ui.open', async () => ({ value: { isPlaced: true } }))

    await $.command.run({
      command: 'veille',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 120 },
    })

    const ui = await $.ui.mount({
      plugin: 'flash-veille',
      surface,
      component: 'Pane',
      requestId: 'flash-veille',
      props: { title: 'Veille fraîche', isFocused: true, bodyColumns: 80, placement: 'dock',
        scroll: { offset: 0, bodyRows: 30 },
        view: {},
      },
    })
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ type: 'Link', text: /PrettyTable/ })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: /Firefox 157/ })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: /Docker Agent/ })).toBeDefined()

    await ui.press({ key: 'tab-jdh' })
    expect(await ui.find({ type: 'Link', text: /PrettyTable/ })).toBeUndefined()
    expect(await ui.find({ type: 'Link', text: /Docker Agent/ })).toBeDefined()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`rotates the freshest items on one line above the prompt (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 1, 18, 0) })
    mock.store(on)
    on('http.fetch', async (_, e) => ({
      value: { status: 200, ok: true, headers: {}, text: FEEDS[e.url] ?? '' },
    }))
    on('ui.open', async () => ({ value: { isPlaced: true } }))
    on('ui.close', async () => ({ value: undefined }))
    // Ce que l'engine dessine quand le bandeau s'efface
    on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {} }))
    on('command.register', async () => ({ value: { command: 'veille' } }))
    on('session.start', async (_, e) => ({ cwd: e.cwd, startedAt: 0 }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    await $.command.run({
      command: 'veille',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 120 },
    })
    const pane = await $.ui.mount({
      plugin: 'flash-veille',
      surface,
      component: 'Pane',
      requestId: 'flash-veille',
      props: {
        title: 'Veille fraîche',
        isFocused: true,
        bodyColumns: 80,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 30 },
        view: {},
      },
    })
    await pane.press({ key: 'refresh' })

    const band = await $.ui.mount({
      plugin: 'flash-veille',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 60, scroll: { offset: 0, bodyRows: 1 }, view: {} },
    })
    // Une seule actu à la fois, la plus fraîche d'abord
    expect(await band.find({ type: 'Text', text: /Veille/ })).toBeDefined()
    expect(await band.findAll({ type: 'Link' })).toHaveLength(1)
    // Le lien mène à la page Human Coders, pas à l'article
    expect((await band.find({ type: 'Link' }))?.text).toMatch(/^https:\/\/news\.humancoders\.com\/t\/python\/items\/67082PrettyTable/)
    expect(await band.find({ type: 'Text', text: '1/3' })).toBeDefined()

    // Puis la suivante, 12 s plus tard (rotation par défaut), qui s'écrit derrière le curseur ·
    await clock.advance(12_000)
    expect(await band.find({ type: 'Link', text: /3mwta· / })).toBeDefined()
    await clock.advance(300)
    expect(await band.find({ type: 'Link', text: /Fire.*·/ })).toBeDefined()
    await clock.advance(1_000)
    expect(await band.find({ type: 'Link', text: /·/ })).toBeUndefined()
    expect((await band.find({ type: 'Link' }))?.text).toMatch(/^https:\/\/bsky\.app\/profile\/camilleroux\.com\/post\/3mwtaFirefox 157/)
    expect(await band.find({ type: 'Text', text: '2/3' })).toBeDefined()

    // Dans un bandeau étroit, le titre est coupé pour tenir sur la ligne
    const narrow = await $.ui.mount({
      plugin: 'flash-veille',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 40, scroll: { offset: 0, bodyRows: 1 }, view: {} },
    })
    const link = await narrow.find({ type: 'Link' })
    expect(link?.text).toMatch(/…$/)

    const veille = (args: string) =>
      $.command.run({
        command: 'veille',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: true, columns: 120 },
      })

    expect(await veille('off')).toMatchObject({ text: expect.stringContaining('masqué') })
    expect(await band.find({ type: 'Link' })).toBeUndefined()

    await veille('')
    expect(await band.find({ type: 'Link' })).toBeDefined()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(
    `follows the sources and keywords options (${surface})`,
    { options: { sources: 'hc, jdh', keywords: 'docker', keywordsOnly: false, rotationSeconds: 8 } },
    async ($, on) => {
      mock.clock(on, { now: Date.UTC(2026, 9, 1, 18, 0) })
      mock.store(on)
      const fetched: string[] = []
      on('http.fetch', async (_, e) => {
        fetched.push(e.url)
        return { value: { status: 200, ok: true, headers: {}, text: FEEDS[e.url] ?? '' } }
      })
      on('ui.open', async () => ({ value: { isPlaced: true } }))

      await $.command.run({
        command: 'veille',
        args: 'tout',
        origin: { kind: 'composer' },
        presentation: { isFullscreen: true, columns: 120 },
      })
      const pane = await $.ui.mount({
        plugin: 'flash-veille',
        surface,
        component: 'Pane',
        requestId: 'flash-veille',
        props: {
          title: 'Flash veille',
          isFocused: true,
          bodyColumns: 80,
          placement: 'dock',
          scroll: { offset: 0, bodyRows: 30 },
          view: {},
        },
      })
      await pane.press({ key: 'refresh' })
      // Seules les sources choisies sont récupérées
      expect(fetched.every(url => /humancoders|journalduhacker/.test(url))).toBe(true)

      const band = await $.ui.mount({
        plugin: 'flash-veille',
        surface,
        component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 1 }, view: {} },
      })
      // L'actu qui parle de Docker passe devant la plus fraîche, marquée ★
      expect(await band.find({ type: 'Link', text: /★ Docker Agent/ })).toBeDefined()
      expect(await band.find({ type: 'Text', text: '1/2' })).toBeDefined()
    },
  )
}
