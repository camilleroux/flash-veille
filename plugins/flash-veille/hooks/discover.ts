// `/veille ajouter korben.info` : trouver le flux RSS/Atom d'un site à partir
// de son adresse, comme le ferait un lecteur de flux.

import type { CustomSource } from '../types'
import { decode } from './feeds'

export type FetchText = (url: string) => Promise<{ ok: boolean; text: string }>

// Les adresses de flux les plus courantes, quand la page n'annonce pas le sien
const GUESSES = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feed/']

const COLORS = ['cyan', 'magenta', 'green', 'yellow', 'blue', 'red']

export function isFeed(text: string): boolean {
  return /<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]/i.test(text.slice(0, 2000))
}

export function normalizeUrl(input: string): string | undefined {
  const raw = input.trim()
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return url.hostname.includes('.') ? url.href : undefined
  } catch {
    return undefined
  }
}

// Un site annonce parfois plusieurs flux : le principal passe avant podcasts et commentaires
const SIDE_FEED = /comment|podcast|mp3|audio|video|episode/i

// <link rel="alternate" type="application/rss+xml" href="…">, attributs dans n'importe quel ordre
export function announcedFeed(html: string, base: string): string | undefined {
  const feeds: string[] = []
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/rel=["']?alternate/i.test(tag) && /type=["']?application\/(rss|atom)\+xml/i.test(tag)) {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1]
      if (href) {
        feeds.push(new URL(decode(href), base).href)
      }
    }
  }
  return feeds.find(url => !SIDE_FEED.test(url)) ?? feeds[0]
}

function feedTitle(xml: string): string | undefined {
  const raw = xml.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]
  return raw
    ? decode(raw.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, ''))
        .replace(/\s+/g, ' ')
        .trim()
    : undefined
}

// "korben.info" → "KOR", "www.journalduhacker.net" → "JOU"
export function shortFor(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '')
  return host.slice(0, 3).toUpperCase()
}

export async function discover(
  input: string,
  fetchText: FetchText,
  taken: number,
): Promise<CustomSource | { error: string }> {
  const start = normalizeUrl(input)
  if (!start) {
    return { error: `« ${input} » n'est pas une adresse de site.` }
  }

  const found = async (url: string): Promise<string | undefined> => {
    try {
      const res = await fetchText(url)
      return res.ok && isFeed(res.text) ? res.text : undefined
    } catch {
      return undefined
    }
  }

  let feedUrl: string | undefined
  let xml: string | undefined
  let announced: string | undefined
  try {
    const page = await fetchText(start)
    if (page.ok && isFeed(page.text)) {
      feedUrl = start
      xml = page.text
    } else if (page.ok) {
      announced = announcedFeed(page.text, start)
    }
  } catch {
    // le site ne répond pas sur cette adresse : on tente les adresses habituelles
  }
  // Le flux annoncé d'abord ; s'il n'est qu'annexe (podcast…), les adresses habituelles avant lui
  const isSide = announced !== undefined && SIDE_FEED.test(announced)
  const candidates = [
    ...(announced && !isSide ? [announced] : []),
    ...GUESSES.map(guess => new URL(guess, start).href),
    ...(announced && isSide ? [announced] : []),
  ]
  for (const url of candidates) {
    if (xml) {
      break
    }
    xml = await found(url)
    feedUrl = xml ? url : undefined
  }
  if (!xml || !feedUrl) {
    return { error: `Aucun flux RSS ou Atom trouvé sur ${start}` }
  }

  const host = new URL(feedUrl).hostname.replace(/^www\./, '')
  return {
    id: `perso-${host}`,
    name: feedTitle(xml) || host,
    short: shortFor(feedUrl),
    color: COLORS[taken % COLORS.length]!,
    url: feedUrl,
  }
}
