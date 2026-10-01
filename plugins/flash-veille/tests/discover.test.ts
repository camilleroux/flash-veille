import { describe, expect, mock, test } from 'claude-code/testing'

import { announcedFeed, discover, normalizeUrl } from '../hooks/discover'

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Les news de Korben</title>
<item><title>AirCard - Relookez vos cartes bancaires</title><link>https://korben.info/aircard.html</link>
<pubDate>Thu, 01 Oct 2026 17:28:03 +0200</pubDate><guid>k1</guid></item></channel></rss>`

// Un petit web : chaque adresse connue répond, les autres sont en 404
const web = (pages: Record<string, string>) => async (url: string) =>
  url in pages ? { ok: true, text: pages[url]! } : { ok: false, text: '' }

describe('discover', () => {
  test('accepts a bare domain', () => {
    expect(normalizeUrl('korben.info')).toBe('https://korben.info/')
    expect(normalizeUrl('pas une adresse')).toBeUndefined()
  })

  test('reads the feed a page announces, even through a relative link', () => {
    const html = '<head><link type="application/atom+xml" href="/news.atom" rel="alternate"></head>'
    expect(announcedFeed(html, 'https://linuxfr.org/')).toBe('https://linuxfr.org/news.atom')
  })

  test('takes a feed address as it is', async () => {
    const found = await discover('https://korben.info/feed', web({ 'https://korben.info/feed': FEED }), 0)
    expect(found).toMatchObject({ url: 'https://korben.info/feed', name: 'Les news de Korben', short: 'KOR' })
  })

  test('follows the feed a site announces', async () => {
    const html = '<link rel="alternate" type="application/rss+xml" href="https://blog.dev/rss.xml">'
    const found = await discover('blog.dev', web({ 'https://blog.dev/': html, 'https://blog.dev/rss.xml': FEED }), 0)
    expect(found).toMatchObject({ url: 'https://blog.dev/rss.xml', id: 'perso-blog.dev' })
  })

  test('guesses the usual feed addresses when the site announces none', async () => {
    const found = await discover('korben.info', web({ 'https://korben.info/': '<html></html>', 'https://korben.info/feed': FEED }), 0)
    expect(found).toMatchObject({ url: 'https://korben.info/feed', id: 'perso-korben.info' })
  })

  test('says so when there is no feed', async () => {
    expect(await discover('vide.dev', web({ 'https://vide.dev/': '<html></html>' }), 0)).toMatchObject({
      error: expect.stringContaining('Aucun flux'),
    })
  })
})

const HC = `<rss><channel><item><title>PrettyTable</title><link>https://github.com/prettytable/prettytable</link>
<pubDate>Thu, 01 Oct 2026 16:50:00 +0000</pubDate><guid>67082</guid></item></channel></rss>`

const BLOG = `<rss><channel><title>Le blog de Zoé</title><item><title>Mon billet tout frais</title>
<link>https://zoe.dev/billet</link><pubDate>Thu, 01 Oct 2026 17:50:00 +0000</pubDate><guid>z1</guid></item></channel></rss>`

for (const surface of ['terminal', 'desktop'] as const) {
  test(
    `adds and removes a site with /veille (${surface})`,
    { options: { sources: 'hc', keywords: '', keywordsOnly: false, rotationSeconds: 8 } },
    async ($, on) => {
      mock.clock(on, { now: Date.UTC(2026, 9, 1, 18, 0) })
      mock.store(on)
      const pages: Record<string, string> = {
        'https://news.humancoders.com/items/feed.rss': HC,
        'https://zoe.dev/': '<html><head><link rel="alternate" type="application/rss+xml" href="/rss.xml"></head></html>',
        'https://zoe.dev/rss.xml': BLOG,
      }
      on('http.fetch', async (_, e) => {
        const text = pages[e.url]
        return { value: { status: text ? 200 : 404, ok: Boolean(text), headers: {}, text: text ?? '' } }
      })
      on('ui.open', async () => ({ value: { isPlaced: true } }))
      on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {} }))

      const veille = (args: string) =>
        $.command.run({
          command: 'veille',
          args,
          origin: { kind: 'composer' },
          presentation: { isFullscreen: true, columns: 120 },
        })

      expect(await veille('ajouter zoe.dev')).toMatchObject({ text: expect.stringContaining('Ajouté : Le blog de Zoé (ZOE)') })
      expect(await veille('ajouter https://zoe.dev/rss.xml')).toMatchObject({ text: expect.stringContaining('déjà suivi') })
      expect(await veille('sources')).toMatchObject({ text: expect.stringContaining('ZOE Le blog de Zoé') })

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
      const band = await $.ui.mount({
        plugin: 'flash-veille',
        surface,
        component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 1 }, view: {} },
      })
      // Le billet le plus frais vient du site ajouté
      expect(await band.find({ type: 'Text', text: 'ZOE' })).toBeDefined()
      expect(await band.find({ type: 'Link', text: /Mon billet tout frais/ })).toBeDefined()

      // Le code, le nom du site ou son adresse : tout le monde ne retient pas « ZOE »
      expect(await veille('retirer inconnu')).toMatchObject({ text: expect.stringContaining('Aucune source') })
      expect(await veille('retirer zoe.dev')).toMatchObject({ text: 'Retiré : Le blog de Zoé.' })
      expect(await band.find({ type: 'Link', text: /Mon billet/ })).toBeUndefined()
      expect(await band.find({ type: 'Link', text: /PrettyTable/ })).toBeDefined()
      expect(await veille('sources')).not.toMatchObject({ text: expect.stringContaining('Zoé') })
    },
  )
}
