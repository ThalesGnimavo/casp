---
phase: fleet-ships-with-casp
---

# 26-08-17-001 — le skill `fleet` entre dans le paquet, et dit qu'il n'est pas CASP

Le paquet livrait déjà trois skills Claude Code qui ne sont pas des verbes du
protocole (`skills/casp`, `skills/next`, `skills/audit-batch`). Un quatrième
les rejoint : `fleet`, qui coordonne plusieurs sessions d'agents parallèles
sur un même dépôt. Il arrive avec des mesures, pas des intentions : trois
essais sur trois dépôts distincts, quatorze incidents enregistrés — dont un
seul qu'un claim de chemin aurait attrapé, et deux qu'il aurait refusés à
tort. C'est la raison pour laquelle cette session livre un document et non le
câblage que tout le monde attendait.

## 1 · La réécriture publique

Le document de travail d'origine est privé : chemins absolus, noms de dépôts
tiers, vocabulaire de rôles interne, tiers de modèle nommés. Le skill livré
est une **réécriture, pas une copie**, et l'acceptation est mécanique — un
grep à frontières de mots sur quatre familles (chemins absolus, noms de
modèles, noms de dépôts, promesse de vitesse) rend zéro occurrence.

Ce qui devait survivre à la réécriture, parce que c'est ce que les essais ont
établi, y est :

- **La forme par défaut est un écrivain plus N lecteurs adverses.** Un lecteur
  ne possède aucun couloir ; son mandat entier est de contredire. Dans cette
  forme, la famille des écritures concurrentes est vide par construction.
- **La valeur mesurée est la contradiction, pas la vitesse.** Rien dans les
  essais ne démontre un gain de vitesse ; le skill ne le promet nulle part, et
  un test le vérifie.
- **L'isolabilité des gates par session** (ports, base, fixtures) est une
  propriété par projet, à mesurer avant tout lancement : un dépôt d'essai
  interdisait tout parallélisme et échouait en silence ; un autre le
  permettait partout sauf une commande de build, qui échouait bruyamment en
  nommant le répertoire partagé. C'est la lisibilité de l'échec qui sépare une
  contrainte gérable d'un piège.
- **Le mode de défaillance dominant est la croyance périmée**, sur les trois
  essais — une session qui raisonne sur un état partagé qu'elle n'observe
  plus. Parade mécanique : fetch et rapport borné à l'ouverture et avant le
  bilan final.
- **Commit par pathspec**, jamais `-a`, jamais `git add -A` : l'index est un
  objet partagé par tous les processus du dépôt.
- Le contrôleur est le goulot et le point unique d'affirmation non vérifiée ;
  sa propre correction se dégrade avec le nombre de couloirs tenus.

## 2 · La décision de lanceur : skill seul, aucun script ne part

Le lanceur de travail dont ce skill est distillé est spécifique à un OS et à
un émulateur de terminal. Le porter mettrait de la machinerie de lancement de
sessions dans le paquet même dont le README affirme que CASP ne lance rien ;
un « contrat de lanceur » documenté sans implémentation serait de la surface
d'API spéculative. Le skill énonce les deux invariants que tout environnement
doit honorer — chaque worker démarre avec son brief déjà chargé, sous un nom
stable et adressable — et laisse l'ouverture des sessions à l'environnement.

## 3 · La frontière, dite partout et testée

Trois affirmations, chacune vérifiable par un lecteur, présentes dans le
README, le CHANGELOG et le skill lui-même :

1. `fleet` lance des sessions, donc il orchestre, donc il n'est jamais une
   fonctionnalité CASP.
2. Aucune règle de `casp check` ne le lit, et rien en lui ne gate un push.
3. Son défaut de modèle est vide — le raisonnement part (un contrôleur et ses
   workers n'ont pas à tourner au même tiers), le nom de modèle jamais.

Le câblage des claims de chemin dans un lanceur est consigné au CHANGELOG
comme **écarté, pas en attente**, avec le compte 14 / 1 / 2 — pour que
personne ne le re-propose dans six mois avec des arguments auxquels trois
essais ont déjà répondu.

## Vérifications

- `npm test` : **228/228 PASS** (222 → 228 ; nouveau fichier
  `test/fleet-skill.test.mjs`, six tests — existence dans le paquet, zéro
  chemin absolu, zéro nom de modèle, zéro dépôt tiers, contradiction-pas-
  vitesse, frontière énoncée).
- `npm pack --dry-run` : 42 fichiers (41 → 42), `skills/fleet/SKILL.md`
  embarqué, version 0.16.0.
- `casp upgrade` exécuté sur ce cockpit (stamp `casp_version` 0.14.2 → 0.16.0,
  `state.json`/`now.md`/`roadmap.md` intacts — vérifié par diff, pas cru sur
  parole) et sur le cockpit du site (un scaffold rafraîchi, état intact).
- Audit adverse en lecture seule avant commit : GO-WITH-FIXES, corrections
  appliquées. La plus utile : le skill disait des claims de `casp live`
  qu'ils « ne gatent jamais », ce que `src/live.ts` contredit — le garde
  refuse bien un appel d'outil (exit 2) ; la phrase précise devient « ne
  gatent jamais un push et ne changent jamais un verdict de `casp check` ».
  Également : vocabulaire de travail retiré d'un champ d'état, regex des
  tests d'acceptation étendues (noms de modèles et de dépôts
  supplémentaires). Sur le compte de tests, le runner fait autorité
  (`# tests 228`, série 222 → 228 cohérente avec les six tests ajoutés).
- `casp check` : sortie brute collée dans le message de clôture, exit 0.

## La release

Le premier essai de publish a rendu **401** (crédential de session invalide),
puis **403** (le publish direct exige le 2FA ou un token à contournement
explicite) — consignés parce que la lecture de l'échec compte : rien dans le
paquet n'en était la cause. Publication faite au token de publication dédié.

- **`@justethales/casp@0.16.0` est publié.** `dist-tags.latest` = `0.16.0`,
  shasum `4c0555a4a8fd95e42d8b09292e351037b64eabbb`, 42 fichiers, 151.8 kB.
- **L'artefact publié a été vérifié depuis le registre**, pas depuis `dist/` :
  le tarball téléchargé contient les quatre skills, et le grep d'acceptation
  (chemins absolus, noms de modèles, dépôts tiers, vocabulaire de rôle) rend
  zéro occurrence sur le `SKILL.md` que les utilisateurs installent.
- **Le fact `npm-published-version` du site est re-vérifié par sa propre
  méthode déclarée** (`npm view`) et passe à `0.16.0`, `verified_at`
  2026-08-17. Aucune page du site n'affichait la chaîne de version, et 0.16.0
  n'ajoute aucun verbe : la liste des verbes du site reste exacte, donc aucun
  contenu de page ne change.

## Non fait, et pourquoi

- **Aucune annonce de `fleet` sur le site** : le contenu du site est relu
  avant publication, et 0.16.0 ne change ni verbe ni page ; rien n'y était
  requis par cette phase.
