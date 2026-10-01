export type BuiltinId =
  | 'hc'
  | 'jdh'
  | 'camille'
  | 'linuxfr'
  | 'korben'
  | 'anthropic'
  | 'claudedev'
  | 'claudecode'
  | 'openai'
  | 'deepmind'
  | 'huggingface'
  | 'simonw'

// Une source ajoutée avec `/veille ajouter <site>`
export type CustomId = `perso-${string}`

export type SourceId = BuiltinId | CustomId

export type Filter = SourceId | 'all'

export type Item = {
  id: string
  source: SourceId
  title: string
  url: string
  discussUrl?: string
  at: number
}

export type CustomSource = {
  id: CustomId
  name: string
  short: string
  color: string
  url: string
}

declare module 'claude-code' {
  interface PluginState {
    'flash-veille': {
      items: Item[]
      fetchedAt: number
      filter: Filter
      isLoading: boolean
      errors: string[]
      index: number
      frame: number
      isBandHidden: boolean
      customSources: CustomSource[]
    }
  }
}
