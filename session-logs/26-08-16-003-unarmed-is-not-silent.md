---
phase: unarmed-is-not-silent
---

# 26-08-16-003 — un garde non armé ne doit pas être muet

0.15.0 a livré la règle de dormance et elle est correcte : les chemins réservés
ne s'arment que si un contrôleur et un autre couloir sont tous deux adossés à
un processus sondable. Ce qui était faux, c'est qu'une catégorie **non armée**
n'en disait rien.

Le déclencheur est une revue externe menée par quelqu'un qui venait de faire
voler une vraie flotte pendant quatre heures. Deux de ses trois remarques ont
produit du code ici.

## 1 · Le trou silencieux

Un contrôleur déclaré depuis un terminal nu prend l'identité de repli
`cli:<user>` et **ne porte aucun PID**. Il n'arme donc rien. Jusqu'ici, la seule
façon de l'apprendre était de remarquer qu'un garde censé se déclencher ne se
déclenchait jamais.

**Une protection que l'on croit active et qui ne l'est pas est pire qu'aucune
protection, parce qu'on lui fait confiance.** La défaillance ouverte est le
contrat et elle ne bouge pas ; la défaillance ouverte *en silence* est autre
chose et n'est pas défendable.

`casp live claims` affiche désormais l'état de la catégorie réservée **et sa
raison**, sur sa propre ligne, dans tous les cas :

```
controller  cto (cli:juste)
reserved paths  not enforced  the controller row carries NO PROCESS ID, so it
arms nothing — it was declared from a bare terminal rather than from inside
the session
```

Les autres états se nomment aussi : `no controller declared`, `no other lane is
held — a solo session is never blocked`, `no other lane carries a process id
(N lane(s) bounded by TTL alone)`, et le cas armé porte la raison de son
armement. `--json` gagne `reserved_paths: { armed, reason }`, et un
coupe-circuit rapporte `armed: false` plutôt qu'une catégorie qu'il neutralise.

Aucun changement de verdict, aucun nouveau sous-verbe, aucune règle ajoutée.
Rapport seul — ce qui est précisément le métier de CASP : un garde non armé est
un fait d'état.

## 2 · La limite qu'il valait mieux nommer que maquiller

`casp live` garde les **écritures de chemins**, pas les **effets de bord d'un
état partagé**. Une revendication couvre un chemin et le garde se déclenche sur
un appel d'outil qui écrit ce chemin. Il n'a rien à dire d'une action qui reste
dans son propre couloir et atteint quand même, par un état que tout le dépôt
partage, ce qui est dehors.

Le cas est mesuré, pas imaginé : `git add <un fichier> && git commit` a publié
**945 lignes de suppressions sans rapport** qu'une autre session venait de
stager — parce que `git commit` sans pathspec publie l'**index entier**, un
objet unique partagé par tous les processus du dépôt. Aucune revendication ne
l'aurait empêché et aucune ne devrait être censée le faire : le garde a vu un
appel `Bash`, et `Bash` n'est délibérément pas gardé.

L'index n'est pas seul dans cette famille : un lockfile régénéré, une migration
de schéma, un port de serveur de développement, un cache de build — autant
d'actions en couloir à effet hors couloir.

`docs/threat-model.md` le dit maintenant en clair, avec les parades, qui sont
procédurales et non mécaniques (committer par pathspec plutôt que se fier à la
discipline de `git add` ; garder les surfaces réellement partagées dans la
catégorie réservée, pour qu'un couloir se voie au moins refuser l'écriture
*directe*). Le README porte la même limite en une phrase, avec un lien.

**Un outil qui énonce précisément ce qu'il ne fait pas est plus crédible qu'un
outil qui laisse croire.** Même posture que l'angle mort des liens symboliques,
déjà nommé en 0.15.0.

## Vérifications

- `npm test` — **222 pass, 0 fail** (221 avant ; une régression ajoutée).
- Les quatre états vérifiés à la main contre le binaire construit : contrôleur
  sans PID, contrôleur avec PID plus couloir, contrôleur seul, aucun contrôleur.
  Chacun nomme sa raison.
- `casp check` — voir le message de clôture.

## Non fait, et pourquoi

La troisième remarque de la revue portait sur une divergence **hors de ce
dépôt** : un lanceur de flotte qui déclare des couloirs sans poser le moindre
`casp live claim`, si bien que la documentation affirme une protection qui
n'existe pas. Le correctif proposé — une source unique du couloir, le worker
posant sa revendication depuis sa propre session, ce qui règle au passage le
piège du PID — est juste, mais il vit dans l'outillage appelant, pas dans
`casp-core`. Rien n'a été touché ici pour ça, et rien ne doit l'être : ce serait
faire entrer l'orchestration dans le binaire par la porte de service.
