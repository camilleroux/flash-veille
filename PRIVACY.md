# Politique de confidentialité de Flash veille

*Dernière mise à jour : 2 octobre 2026*

Flash veille est un plugin (mod) pour Claude Code. Il ne collecte, ne transmet ni ne vend aucune donnée personnelle.

## Ce que le plugin envoie

Rien qui vienne de votre machine. Le plugin fait uniquement des requêtes HTTPS `GET`, en lecture seule, vers les flux RSS/Atom des sources que vous suivez (la liste des hôtes est dans le [README](https://github.com/camilleroux/flash-veille#readme)) et vers le site que vous donnez à `/veille ajouter`. Ces requêtes ne portent que l'adresse du flux et un en-tête `User-Agent` fixe. Pas de cookie, pas d'identifiant, pas de contenu de vos fichiers, de votre code ou de vos conversations.

Comme toute requête web, chaque site contacté voit votre adresse IP ; c'est sa propre politique de confidentialité qui s'applique.

## Ce que le plugin garde

Sur votre machine seulement, dans le stockage local que Claude Code donne au plugin : le cache des dernières actus, la liste des sites que vous avez ajoutés et l'état masqué du bandeau. Désinstaller le plugin supprime son usage ; aucune copie n'existe ailleurs.

## Ce que l'auteur reçoit

Rien : pas de serveur, pas d'analytics, pas de télémétrie.

## Contact

Une question : [ouvrez une issue](https://github.com/camilleroux/flash-veille/issues) ou passez par [camilleroux.com/contact](https://www.camilleroux.com/contact/).

---

*In English: Flash veille collects no personal data. It only sends read-only HTTPS GET requests to the RSS/Atom feeds you follow, carrying nothing but the feed URL and a fixed User-Agent. It keeps its cache, your added sites and the band's hidden state in Claude Code's local plugin storage. The author receives nothing: no server, no analytics, no telemetry.*
