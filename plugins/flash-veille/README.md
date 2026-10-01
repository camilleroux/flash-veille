# Flash veille

Le flash info du dev, au-dessus du prompt de [Claude Code](https://code.claude.com).

Pendant que vous codez, une ligne discrète fait défiler les actus fraîches de la tech francophone et des labos d'IA, une à la fois :

![Le bandeau Flash veille au-dessus du prompt de Claude Code](https://raw.githubusercontent.com/camilleroux/flash-veille/main/docs/demo.gif)

Chaque titre mène là où l'actu a été partagée : la page de l'actu sur Human Coders News ou sur le Journal du hacker, et pour la veille de Camille Roux, son post sur Bluesky.

> Flash veille est un *mod* Claude Code (un plugin à hooks de fonction) : il demande **Claude Code 2.1.287 ou plus récent**. L'API des mods est en accès anticipé et peut encore changer.

## Installation

```
/plugin marketplace add camilleroux/flash-veille
/plugin install flash-veille@flash-veille
```

Le bandeau apparaît au-dessus du prompt dès la session suivante.

## Commandes

| Commande | Effet |
| --- | --- |
| `/veille` | Affiche le bandeau et rafraîchit les actus |
| `/veille tout` | Ouvre la liste complète dans un panneau, filtrable par source |
| `/veille off` | Masque le bandeau (et le panneau) ; mémorisé d'une session à l'autre |
| `/veille sources` | Liste les sources suivies |
| `/veille ajouter <site>` | Suit un autre site : `/veille ajouter korben.info` trouve son flux tout seul |
| `/veille retirer <site>` | Ne plus suivre un site ajouté avec `/veille ajouter` : `/veille retirer korben` (son code `kor` ou `korben.info` marchent aussi) |

Le bandeau se replie aussi avec `ctrl+x ctrl+a`.

## Options

Dans `/config`, sous **flash-veille** :

| Option | Par défaut | Effet |
| --- | --- | --- |
| Sources | `hc, jdh, camille, linuxfr, anthropic, claudedev, claudecode` | Les sources intégrées à suivre |
| Rotation (secondes) | `12` | Durée d'affichage de chaque actu |
| Mots-clés | *(vide)* | Ex. `IA, Rails, sécurité` : les actus qui en parlent passent en premier, marquées ★ (casse et accents ignorés) |
| Seulement les mots-clés | non | N'affiche que ces actus |

## Sources intégrées

| Code | Source | Par défaut |
| --- | --- | :-: |
| `hc` | [Human Coders News](https://news.humancoders.com) | ✓ |
| `jdh` | [Journal du hacker](https://www.journalduhacker.net) | ✓ |
| `camille` | [La veille de Camille Roux](https://www.camilleroux.com/veille/), publiée sur Bluesky | ✓ |
| `linuxfr` | [Dépêches LinuxFr.org](https://linuxfr.org) | ✓ |
| `anthropic` | [Anthropic News](https://www.anthropic.com/news) ¹ | ✓ |
| `claudedev` | [Blog claude.dev](https://claude.dev) | ✓ |
| `claudecode` | [Releases de Claude Code](https://github.com/anthropics/claude-code/releases) | ✓ |
| `korben` | [Korben](https://korben.info) | |
| `openai` | [OpenAI News](https://openai.com/news/) | |
| `deepmind` | [Google DeepMind](https://deepmind.google/discover/blog/) | |
| `huggingface` | [Hugging Face](https://huggingface.co/blog) | |
| `simonw` | [Simon Willison](https://simonwillison.net) | |

¹ anthropic.com n'a pas de flux RSS officiel : Flash veille lit le miroir communautaire [Olshansk/rss-feeds](https://github.com/Olshansk/rss-feeds).

## Respect des sites sources

Les flux sont récupérés au plus tous les quarts d'heure, et ce cache est partagé entre toutes vos sessions Claude Code : ouvrir dix sessions ne fait pas dix fois plus de requêtes. Chaque requête s'annonce avec un `User-Agent` qui renvoie vers ce dépôt.

## Ce que fait le mod : réseau, données, hooks

**Réseau.** Le mod ne fait que des requêtes HTTPS `GET`, en lecture seule, au plus toutes les 15 minutes (cache partagé entre les sessions), vers :

- les flux des sources intégrées activées, et seulement elles : `news.humancoders.com`, `www.journalduhacker.net`, `bsky.app`, `linuxfr.org`, `raw.githubusercontent.com` (miroir Anthropic), `claude.dev`, `github.com` (releases de Claude Code), et sur option `korben.info`, `openai.com`, `deepmind.google`, `huggingface.co`, `simonwillison.net` ;
- le site que vous donnez vous-même à `/veille ajouter <site>` : sa page d'accueil pour y trouver le flux annoncé, puis au besoin les adresses de flux habituelles du même site (`/feed`, `/rss`, `/feed.xml`, `/rss.xml`, `/atom.xml`, `/index.xml`, `/feed/`), et ensuite son flux.

L'adresse de chaque requête vient de cette liste ou de ce que vous avez tapé : c'est pourquoi elle n'est pas écrite en dur à l'appel.

**Données envoyées.** Aucune donnée locale ne sort : ni fichier, ni code, ni conversation, ni identifiant. Une requête ne porte que l'adresse du flux et un `User-Agent` fixe (`flash-veille/0.4 (Claude Code mod; +https://github.com/camilleroux/flash-veille)`) ; pas de cookie, pas d'authentification, pas de corps de requête.

**Données gardées.** Dans le stockage local que Claude Code donne au plugin : le cache des actus, la liste des sites ajoutés et l'état masqué du bandeau. Rien d'autre.

**Commandes et outils.** Le mod n'exécute aucune commande, aucun outil, aucun agent, et ne lit aucun fichier. Le contenu des flux n'est jamais interprété comme une instruction : ce n'est que du texte affiché (un titre et un lien).

**Hooks.**

- `session.start` : enregistre la commande `/veille`, charge le cache et lance deux minuteurs (récupération des flux toutes les 15 minutes, rotation du bandeau).
- `command.run` : ne reçoit que `/veille` (le hook ne s'abonne qu'à cette commande) ; les autres commandes ne passent pas par lui.
- `ui.render` : dessine le bandeau au-dessus du prompt (`AbovePrompt`) et le panneau du mod (`Pane` ouvert par `/veille tout`) ; il ne modifie aucun autre affichage, et laisse la place à Claude Code dès qu'un sondage occupe le bandeau.

Le détail est dans la [politique de confidentialité](https://github.com/camilleroux/flash-veille/blob/main/PRIVACY.md).

> **In English.** Flash veille only sends read-only HTTPS GET requests, at most every 15 minutes, to the RSS/Atom feeds of the enabled sources listed above and to the site you pass to `/veille ajouter`. It sends no local data (no files, code, conversation or credentials), only the feed URL and a fixed User-Agent. It runs no commands, tools or agents and reads no files. It hooks `session.start` (registers `/veille`, starts the timers), `command.run` (only `/veille`) and `ui.render` (its own band above the prompt and its own pane).

## Développement

```
claude plugin validate .
claude plugin test .
```

Pour essayer vos modifications : `claude --plugin-dir .`.

## Licence

[MIT](https://github.com/camilleroux/flash-veille/blob/main/LICENSE), par [Camille Roux](https://www.camilleroux.com).
