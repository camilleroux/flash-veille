import type { Item, SourceId } from '../types'

export type Source = {
  id: SourceId
  name: string
  short: string
  color: string
  url: string
}

export const SOURCES: Source[] = [
  {
    id: 'hc',
    name: 'Human Coders News',
    short: 'HC',
    color: 'magenta',
    url: 'https://news.humancoders.com/items/feed.rss',
  },
  {
    id: 'jdh',
    name: 'Journal du hacker',
    short: 'JdH',
    color: 'yellow',
    url: 'https://www.journalduhacker.net/rss',
  },
  {
    // La veille quotidienne de Camille, telle que publiée sur Bluesky
    id: 'camille',
    name: 'Camille Roux',
    short: 'CR',
    color: 'cyan',
    url: 'https://bsky.app/profile/camilleroux.com/rss',
  },
  {
    id: 'linuxfr',
    name: 'Dépêches LinuxFr.org',
    short: 'LFR',
    color: 'blueBright',
    url: 'https://linuxfr.org/news.atom',
  },
  {
    id: 'korben',
    name: 'Korben',
    short: 'KOR',
    color: 'greenBright',
    url: 'https://korben.info/feed',
  },
  {
    // anthropic.com/news n'a pas de flux officiel : miroir communautaire (github.com/Olshansk/rss-feeds)
    id: 'anthropic',
    name: 'Anthropic News',
    short: 'ANT',
    color: 'redBright',
    url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml',
  },
  {
    id: 'claudedev',
    name: 'Blog claude.dev',
    short: 'CDV',
    color: 'red',
    url: 'https://claude.dev/rss.xml',
  },
  {
    id: 'claudecode',
    name: 'Releases Claude Code',
    short: 'CC',
    color: 'yellowBright',
    url: 'https://github.com/anthropics/claude-code/releases.atom',
  },
  {
    id: 'openai',
    name: 'OpenAI News',
    short: 'OAI',
    color: 'green',
    url: 'https://openai.com/news/rss.xml',
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    short: 'GDM',
    color: 'blue',
    url: 'https://deepmind.google/blog/rss.xml',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    short: 'HF',
    color: 'yellow',
    url: 'https://huggingface.co/blog/feed.xml',
  },
  {
    id: 'simonw',
    name: 'Simon Willison',
    short: 'SW',
    color: 'whiteBright',
    url: 'https://simonwillison.net/atom/everything/',
  },
]

// "hc, JdH ,anthropic" → les sources connues, dans l'ordre de SOURCES ; vide ou inconnu → aucune
export function pickSources(list: string): Source[] {
  const wanted = new Set(
    list
      .split(',')
      .map(id => id.trim().toLowerCase())
      .filter(Boolean),
  )
  return SOURCES.filter(source => wanted.has(source.id))
}

export function parseKeywords(list: string): string[] {
  return list
    .split(',')
    .map(word => word.trim().toLowerCase())
    .filter(Boolean)
}

// Sans accents ni casse : « sécurité » trouve « Securite »
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function matchesKeywords(title: string, keywords: string[]): boolean {
  const haystack = fold(title)
  return keywords.some(word => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(fold(word))}($|[^\\p{L}\\p{N}])`, 'u').test(haystack))
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Les actus qui parlent des mots-clés d'abord (ou seules), les autres ensuite, chacune par fraîcheur
export function byKeywords(items: Item[], keywords: string[], isOnly: boolean): Item[] {
  if (keywords.length === 0) {
    return items
  }
  const hits = items.filter(item => matchesKeywords(item.title, keywords))
  return isOnly ? hits : [...hits, ...items.filter(item => !hits.includes(item))]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

function tag(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  if (!match) {
    return undefined
  }
  const raw = (match[1] ?? '').trim()
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  return cdata ? (cdata[1] ?? '') : decode(raw)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// RFC 822 ("Thu, 01 Oct 2026 16:50:00 +0000", "01 Oct 2026 18:00 +0200")
export function parseDate(text: string | undefined): number {
  const m = text?.match(/(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[a-z]+)?/i)
  if (!m) {
    return 0
  }
  const [, day = '', mon = '', year = '', hour = '', minute = '', second = '0', zone = ''] = m
  const month = MONTHS.indexOf(mon.toLowerCase())
  if (month < 0) {
    return 0
  }
  const utc = Date.UTC(+year, month, +day, +hour, +minute, +second)
  if (/^[+-]\d{4}$/.test(zone)) {
    const sign = zone[0] === '-' ? -1 : 1
    const minutes = +zone.slice(1, 3) * 60 + +zone.slice(3, 5)
    return utc - sign * minutes * 60_000
  }
  return utc
}

// ISO 8601 des flux Atom ("2026-10-01T18:43:19Z", "2026-10-01T06:29:01+00:00")
export function parseIsoDate(text: string | undefined): number {
  const m = text?.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/)
  if (!m) {
    return 0
  }
  const [, year = '', month = '', day = '', hour = '', minute = '', second = '0', zone = 'Z'] = m
  const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)
  if (zone === 'Z') {
    return utc
  }
  const sign = zone[0] === '-' ? -1 : 1
  const digits = zone.replace(/[^\d]/g, '')
  return utc - sign * (+digits.slice(0, 2) * 60 + +digits.slice(2, 4)) * 60_000
}

function stripHtml(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' '))
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

// Un post Bluesky : le texte avant le lien devient le titre, le lien l'URL
function fromPost(description: string): { title: string; url?: string } {
  const text = description.replace(/📬[\s\S]*$/u, '').trim()
  const url = text.match(/https?:\/\/\S+/)?.[0]
  const title = (url ? text.slice(0, text.indexOf(url)) : text).replace(/⬇️/gu, '')
  return { title: oneLine(title, 200), url }
}

export function parseFeed(xml: string, source: SourceId): Item[] {
  const items: Item[] = []
  for (const block of xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []) {
    const link = tag(block, 'link')
    const at = parseDate(tag(block, 'pubDate')) || parseIsoDate(tag(block, 'dc:date'))
    const id = tag(block, 'guid') ?? link
    if (!link || !id) {
      continue
    }
    if (source === 'camille') {
      const post = fromPost(tag(block, 'description') ?? '')
      if (!post.title) {
        continue
      }
      items.push({ id: `${source}:${id}`, source, title: post.title, url: post.url ?? link, discussUrl: link, at })
      continue
    }
    const title = tag(block, 'title')
    if (!title) {
      continue
    }
    items.push({ id: `${source}:${id}`, source, title: oneLine(title, 200), url: link, discussUrl: tag(block, 'comments')?.replace(/#comments$/, ''), at })
  }
  for (const block of xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []) {
    const item = fromEntry(block, source)
    if (item) {
      items.push(item)
    }
  }
  return items
}

// Une entrée Atom (Simon Willison, LinuxFr, releases GitHub)
function fromEntry(block: string, source: SourceId): Item | undefined {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => m[1] ?? '')
  const alternate = links.find(attrs => !/rel="(?!alternate)/.test(attrs)) ?? links[0]
  const link = alternate?.match(/href="([^"]+)"/)?.[1]
  const raw = tag(block, 'title')
  if (!link || !raw) {
    return undefined
  }
  const at = parseIsoDate(tag(block, 'published') ?? tag(block, 'updated'))
  const id = tag(block, 'id') ?? link
  let title = stripHtml(raw)
  if (source === 'claudecode') {
    // "v2.1.287" seul ne dit rien : on y ajoute la première nouveauté de la release
    const first = (tag(block, 'content') ?? '').match(/<li>([\s\S]*?)<\/li>/i)?.[1]
    title = `Claude Code ${title}${first ? ` : ${stripHtml(first)}` : ''}`
  }
  return { id: `${source}:${id}`, source, title: oneLine(title, 200), url: decode(link), at }
}

// Fusionne, dédoublonne par URL (la plus ancienne mention gagne), trie du plus frais au plus ancien
export function merge(lists: Item[][], limit = 150): Item[] {
  const byUrl = new Map<string, Item>()
  for (const item of lists.flat()) {
    const key = item.url.replace(/[?#].*$/, '').replace(/\/$/, '')
    const known = byUrl.get(key)
    if (!known || (item.at && item.at < known.at)) {
      byUrl.set(key, item)
    }
  }
  return [...byUrl.values()].sort((a, b) => b.at - a.at).slice(0, limit)
}

export function ago(at: number, now: number): string {
  if (!at) {
    return '?'
  }
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  if (minutes < 60) {
    return `${minutes}min`
  }
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}j`
}

// Colonnes qu'occupe un caractère dans un terminal : 0 (combinant), 1 ou 2 (emoji, CJK)
function charColumns(cp: number): number {
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) {
    return 0
  }
  if (
    cp >= 0x1f000 ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x2b00 && cp <= 0x2bff) ||
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xff60)
  ) {
    return 2
  }
  return 1
}

export function columns(text: string): number {
  let total = 0
  for (const char of text) {
    total += charColumns(char.codePointAt(0) ?? 0)
  }
  return total
}

// Coupe `text` pour qu'il tienne dans `max` colonnes, avec « … » s'il est coupé
export function fit(text: string, max: number): string {
  if (columns(text) <= max) {
    return text
  }
  let out = ''
  let used = 0
  for (const char of text) {
    const width = charColumns(char.codePointAt(0) ?? 0)
    if (used + width > max - 1) {
      break
    }
    out += char
    used += width
  }
  return max > 0 ? `${out.trimEnd()}…` : ''
}

// Un href que Link accepte : https, ASCII, normalisé
export function safeHref(url: string): string | undefined {
  try {
    const href = new URL(url).href
    return href.startsWith('https://') && href.length <= 2048 && /^[\x21-\x7e]+$/.test(href) && !href.includes('@')
      ? href
      : undefined
  } catch {
    return undefined
  }
}
