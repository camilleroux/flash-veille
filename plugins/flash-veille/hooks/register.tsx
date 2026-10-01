import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CustomSource, Filter, Item, SourceId } from '../types'
import { discover } from './discover'
import type { Source } from './feeds'
import {
  SOURCES,
  ago,
  byKeywords,
  columns,
  fit,
  matchesKeywords,
  merge,
  parseFeed,
  parseKeywords,
  pickSources,
  safeHref,
} from './feeds'
import { revealFrame } from './transition'

const PANE = 'flash-veille'
const TITLE = 'Flash veille'
const DEFAULT_SOURCES = 'hc, jdh, camille, linuxfr, anthropic, claudedev, claudecode'
const REFRESH_MS = 15 * 60_000
// Un cache « presque périmé » est rafraîchi, pour que le minuteur ne le rate pas d'un cheveu
const CACHE_MARGIN_MS = 60_000
const USER_AGENT = 'flash-veille/0.4 (Claude Code mod; +https://github.com/camilleroux/flash-veille)'
const FRESH_MS = 24 * 3600_000
const MAX_SHOWN = 60
const CACHE_KEY = 'items'
const HIDDEN_KEY = 'isBandHidden'
const CUSTOM_KEY = 'customSources'
const TICKER_POOL = 15
const MIN_ROTATE_S = 3
const DEFAULT_ROTATE_S = 12
const FRAMES = 12
const FRAME_MS = 60
const LABEL = '📰 Veille'
const STAR = '★ '
const ENGINE_CONTROL = 5
const USAGE = '/veille [tout | off | sources | ajouter <site> | retirer <code>]'

const items = atom({ plugin: 'flash-veille', key: 'items' } as const, [])
const fetchedAt = atom({ plugin: 'flash-veille', key: 'fetchedAt' } as const, 0)
const filter = atom({ plugin: 'flash-veille', key: 'filter' } as const, 'all')
const isLoading = atom({ plugin: 'flash-veille', key: 'isLoading' } as const, false)
const errors = atom({ plugin: 'flash-veille', key: 'errors' } as const, [])
const index = atom({ plugin: 'flash-veille', key: 'index' } as const, 0)
const frame = atom({ plugin: 'flash-veille', key: 'frame' } as const, FRAMES)
const isBandHidden = atom({ plugin: 'flash-veille', key: 'isBandHidden' } as const, false)
const customSources = atom({ plugin: 'flash-veille', key: 'customSources' } as const, [])

type Cache = { items?: Item[]; fetchedAt?: number; sourceIds?: string[] }

// Le cache est partagé entre les sessions : tant qu'il est frais et couvre les sources
// suivies, aucune session ne retélécharge les flux (sauf demande explicite)
async function refresh($: EngineInterface, sources: Source[], isForced = false): Promise<void> {
  if (await read($, isLoading)) {
    return
  }
  const now = await $.clock.now()
  if (!isForced) {
    const cached = (await $.store.get(CACHE_KEY)) as Cache | undefined
    const isFresh = cached?.fetchedAt !== undefined && now - cached.fetchedAt < REFRESH_MS - CACHE_MARGIN_MS
    if (isFresh && cached.items && sources.every(s => cached.sourceIds?.includes(s.id))) {
      await update($, items, () => cached.items ?? [])
      await update($, fetchedAt, () => cached.fetchedAt ?? now)
      return
    }
  }
  await update($, isLoading, () => true)
  const failed: string[] = []
  const lists = await Promise.all(
    sources.map(async source => {
      try {
        const res = await $.http.fetch(source.url, { headers: { 'user-agent': USER_AGENT } })
        if (!res.ok) {
          failed.push(`${source.name} (HTTP ${res.status})`)
          return []
        }
        return parseFeed(res.text, source.id)
      } catch {
        failed.push(source.name)
        return []
      }
    }),
  )
  // Une source en panne garde ses anciens items plutôt que de disparaître
  const previous = await read($, items)
  const kept = sources.flatMap((source, i) => {
    const fresh = lists[i] ?? []
    return fresh.length ? fresh : previous.filter(it => it.source === source.id)
  })
  const merged = merge([kept])
  await update($, items, () => merged)
  await update($, fetchedAt, () => now)
  await update($, errors, () => failed)
  await update($, isLoading, () => false)
  const cache: Cache = { items: merged, fetchedAt: now, sourceIds: sources.map(s => s.id) }
  await $.store.set(CACHE_KEY, cache)
}

// Les images de la transition, une par FRAME_MS, jusqu'au titre en entier
function animate($: EngineInterface, next: number): void {
  $.clock.after(FRAME_MS, () => {
    void update($, frame, () => next).then(() => {
      if (next < FRAMES) {
        animate($, next + 1)
      }
    })
  })
}

// Masquer le bandeau vaut aussi pour les sessions suivantes
async function setBandHidden($: EngineInterface, hidden: boolean): Promise<void> {
  await update($, isBandHidden, () => hidden)
  await $.store.set(HIDDEN_KEY, hidden)
}

// Les sources suivies : celles des options, puis celles ajoutées avec /veille ajouter
async function activeSources($: EngineInterface, builtins: Source[]): Promise<Source[]> {
  return [...builtins, ...(await read($, customSources))]
}

async function setCustomSources($: EngineInterface, list: CustomSource[]): Promise<void> {
  await update($, customSources, () => list)
  await $.store.set(CUSTOM_KEY, list)
}

export const register: Register = (on, options) => {
  // Les options du plugin (menu de config) : un changement recharge le module
  const picked = pickSources(String(options.sources ?? DEFAULT_SOURCES))
  const builtins = picked.length ? picked : pickSources(DEFAULT_SOURCES)
  const rotateMs = Math.max(MIN_ROTATE_S, Number(options.rotationSeconds) || DEFAULT_ROTATE_S) * 1000
  const keywords = parseKeywords(String(options.keywords ?? ''))
  const isKeywordsOnly = options.keywordsOnly === true

  const sourceOf = (id: SourceId, active: Source[]) => active.find(s => s.id === id) ?? SOURCES.find(s => s.id === id)

  // Ce qui s'affiche : les sources actives, les mots-clés d'abord (ou seuls)
  const visible = (all: Item[], active: Source[]) =>
    byKeywords(
      all.filter(item => active.some(s => s.id === item.source)),
      keywords,
      isKeywordsOnly,
    )
  const star = (item: Item) => (keywords.length && matchesKeywords(item.title, keywords) ? STAR : '')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'veille',
      description: 'Flash veille : les actus fraîches au-dessus du prompt',
      argumentHint: '[tout|off|sources|ajouter <site>|retirer <code>]',
    })
    const wasHidden = (await $.store.get(HIDDEN_KEY)) === true
    await update($, isBandHidden, () => wasHidden)
    const custom = (await $.store.get(CUSTOM_KEY)) as CustomSource[] | undefined
    await update($, customSources, () => custom ?? [])

    // Le cache de la session précédente s'affiche tout de suite
    if ((await read($, items)).length === 0) {
      const cached = (await $.store.get(CACHE_KEY)) as { items?: Item[]; fetchedAt?: number } | undefined
      if (cached?.items?.length) {
        await update($, items, () => cached.items ?? [])
        await update($, fetchedAt, () => cached.fetchedAt ?? 0)
      }
    }
    await update($, isLoading, () => false)

    void activeSources($, builtins).then(sources => refresh($, sources))
    $.clock.every(REFRESH_MS, () => void activeSources($, builtins).then(sources => refresh($, sources)))
    // Le bandeau passe à l'actu suivante, sauf quand il est masqué
    $.clock.every(rotateMs, async () => {
      if (!(await read($, isBandHidden))) {
        await update($, index, n => n + 1)
        await update($, frame, () => 0)
        animate($, 1)
      }
    })

    return next(e)
  })

  // Tout passe par la commande : les clics et les touches n'atteignent pas le bandeau partout
  on('command.run', { command: 'veille' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')

    switch (verb.toLowerCase()) {
      case 'off': {
        await setBandHidden($, true)
        await $.ui.close({ id: PANE })

        return { text: 'Flash veille masqué (/veille pour le réafficher).' }
      }
      case 'tout': {
        await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true })
        void refresh($, await activeSources($, builtins))

        return { text: 'Pane « Flash veille » ouvert (/veille off pour le fermer).' }
      }
      case 'sources': {
        const custom = await read($, customSources)
        const lines = [
          ...builtins.map(s => `${s.short.padEnd(4)}${s.name}`),
          ...custom.map(s => `${s.short.padEnd(4)}${s.name} (ajoutée : /veille retirer ${s.short.toLowerCase()})`),
        ]

        return {
          text: [
            'Sources suivies :',
            ...lines.map(line => `  ${line}`),
            '',
            'Ajouter un site : /veille ajouter korben.info',
            `Sources intégrées disponibles : ${SOURCES.map(s => s.id).join(', ')} (option « Sources » de /config)`,
          ].join('\n'),
        }
      }
      case 'ajouter': {
        if (!arg) {
          return { text: 'Usage : /veille ajouter <adresse du site ou du flux>, par exemple /veille ajouter korben.info' }
        }
        const custom = await read($, customSources)
        const found = await discover(
          arg,
          async url => {
            const res = await $.http.fetch(url, { headers: { 'user-agent': USER_AGENT } })
            return { ok: res.ok, text: res.text }
          },
          custom.length,
        )
        if ('error' in found) {
          return { text: found.error }
        }
        const active = await activeSources($, builtins)
        if (active.some(s => s.url === found.url || s.id === found.id)) {
          return { text: `${found.name} est déjà suivi.` }
        }
        // Deux sources ne partagent pas un code : KOR, KOR2…
        const codes = new Set(active.map(s => s.short))
        let short = found.short
        for (let n = 2; codes.has(short); n++) {
          short = `${found.short.slice(0, 2)}${n}`
        }
        const source = { ...found, short }
        await setCustomSources($, [...custom, source])
        await setBandHidden($, false)
        void refresh($, [...active, source], true)

        return { text: `Ajouté : ${source.name} (${source.short}), ${source.url}` }
      }
      case 'retirer': {
        const custom = await read($, customSources)
        const wanted = arg.toLowerCase()
        const gone = custom.find(s => s.short.toLowerCase() === wanted || s.id === wanted || s.url === arg)
        if (!gone) {
          return { text: `Aucune source ajoutée ne correspond à « ${arg} » (voir /veille sources).` }
        }
        await setCustomSources(
          $,
          custom.filter(s => s !== gone),
        )
        await update($, items, list => list.filter(it => it.source !== gone.id))

        return { text: `Retiré : ${gone.name}.` }
      }
      case '': {
        await setBandHidden($, false)
        void refresh($, await activeSources($, builtins))

        return { text: `Flash veille affiché au-dessus du prompt. ${USAGE}` }
      }
      default:
        return { text: `Commande inconnue. ${USAGE}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const active = await activeSources($, builtins)
    const all = visible(await read($, items), active).slice(0, TICKER_POOL)
    if (e.props.hasSurvey || all.length === 0 || (await read($, isBandHidden))) {
      return next(e)
    }

    const { Box, Text, Link } = $.ui.resolve(e)
    const now = await $.clock.now()
    const position = (await read($, index)) % all.length
    const item = all[position]!
    const source = sourceOf(item.source, active)!
    const href = safeHref(item.discussUrl ?? item.url)
    const age = ago(item.at, now)
    const counter = `${position + 1}/${all.length}`
    // Le titre est coupé ici, en colonnes réelles : la ligne ne passe jamais à la ligne.
    // ENGINE_CONTROL : le « [-] » que Claude Code dessine par-dessus le bout du bandeau ; on lui laisse sa place
    const fixed = columns(LABEL) + source.short.length + age.length + counter.length + 4 + ENGINE_CONTROL
    const title = revealFrame(fit(star(item) + item.title, e.props.bodyColumns - fixed), await read($, frame), FRAMES)

    return (
      <Box width={e.props.bodyColumns - ENGINE_CONTROL} height={1} overflow="hidden" columnGap={1}>
        <Text dimColor>{LABEL}</Text>
        <Text color={source.color} bold>
          {source.short}
        </Text>
        <Text dimColor>{age}</Text>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">{href ? <Link href={href}>{title}</Link> : title}</Text>
        </Box>
        <Text dimColor>{counter}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const active = await activeSources($, builtins)
    const all = visible(await read($, items), active)
    const current: Filter = await read($, filter)
    const loading = await read($, isLoading)
    const failed = await read($, errors)
    const at = await read($, fetchedAt)
    const now = await $.clock.now()

    const shown = current === 'all' ? all : all.filter(it => it.source === current)
    const width = e.props.bodyColumns
    const tabs: { id: Filter; label: string }[] = [
      { id: 'all', label: 'Tout' },
      ...active.map(s => ({ id: s.id, label: s.short })),
    ]

    return (
      <Box flexDirection="column" width={width}>
        <Box flexWrap="wrap" columnGap={1}>
          {tabs.map(tab => (
            <Button
              key={`tab-${tab.id}`}
              label={tab.label}
              variant={tab.id === current ? 'primary' : undefined}
              onPress={() => update($, filter, () => tab.id)}
            />
          ))}
          <Button key="refresh" label={loading ? '…' : '↻'} hotkey="r" onPress={() => refresh($, active, true)} />
          <Button key="close" label="fermer" hotkey="x" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        <Text dimColor wrap="truncate-end">
          {loading ? 'Mise à jour…' : at ? `Mis à jour il y a ${ago(at, now)}` : 'Chargement…'}
          {failed.length ? ` · injoignable : ${failed.join(', ')}` : ''}
        </Text>
        {shown.length === 0 && !loading && <Text dimColor>Rien pour l'instant.</Text>}
        {shown.slice(0, MAX_SHOWN).map(item => {
          const source = sourceOf(item.source, active)!
          const href = safeHref(item.discussUrl ?? item.url)
          const isFresh = item.at > 0 && now - item.at < FRESH_MS
          const title = star(item) + item.title
          return (
            <Box key={item.id} columnGap={1}>
              <Text color={source.color}>{source.short.padEnd(3)}</Text>
              <Text dimColor>{ago(item.at, now).padStart(4)}</Text>
              <Box flexShrink={1}>
                <Text wrap="truncate-end" dimColor={!isFresh} bold={isFresh}>
                  {href ? <Link href={href}>{title}</Link> : title}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
