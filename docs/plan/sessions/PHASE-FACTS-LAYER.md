---
status: shipped
session_id: pending
session_log: session-logs/26-07-21-008-facts-layer.md
drafted_at: 2026-07-20
next_after: PHASE-PROMPT-CHAIN-INTEGRITY
parent_prompt: null
---

# PHASE — Facts layer : prouver la fraîcheur, pas la vérité

> **Statut : EN FILE.** Rédigé le 2026-07-20 sur la base de la **0.10.0**, **rafraîchi le
> 2026-07-21** à la clôture de la session `26-07-21-007` (0.13.0) — voir la première sous-section
> de `CONTEXT` pour ce qui a bougé. Le diagnostic et la conception tiennent ; trois prémisses de
> détail ont été corrigées.
>
> **Origine** : incident réel du 2026-07-20 sur un cockpit de production. Une journée entière de
> travail a été bâtie sur cinq affirmations fausses, **sans que `casp check` ne signale quoi que
> ce soit** — parce qu'aucune n'était une dérive d'état. `state.json` contre git était juste
> toute la journée. Ce qui mentait vivait dans les documents *autour* du cockpit.

---

## CONTEXT

### Ce qui a changé depuis la rédaction — rafraîchi le 2026-07-21

Ce prompt a été rédigé le 2026-07-20, sur la base de la version **0.10.0**. Quatre releases ont
été livrées depuis. Le diagnostic de l'incident et la conception de la couche tiennent
intégralement ; trois prémisses de détail ont bougé et sont corrigées ci-dessous.

| Release | Ce qui a été livré | Effet sur ce prompt |
|---|---|---|
| `0.11.0` | `CASP-SESSION-003` — chaque phase livrée doit être déclarée par un journal de session | Premier précédent d'**adoption dérivée des données** : aucune clé d'état, silence total tant que le dépôt n'a rien déclaré. C'est le patron exact que `facts.json` doit suivre. |
| `0.12.0` | `casp upgrade` — rafraîchir les gabarits d'un cockpit sans manger son état | **Débloque cette phase.** `casp/facts.json` est un fichier de données à la racine du cockpit ; sans `upgrade`, aucun dépôt déjà sous CASP ne pouvait recevoir un nouveau gabarit. |
| `0.12.1` | Correctifs de perte de données dans `upgrade` ; `saveState` rendu **atomique** | Invalide une partie du SHOULD « écriture atomique ». Voir ci-dessous. |
| `0.13.0` | `CASP-PROMPT-007` … `010` — intégrité de la chaîne de prompts | Deuxième précédent d'adoption dérivée, et confirmation que la réservation de codes dans un espace existant fonctionne sans casser le schéma du rapport. |

Suite de tests à l'entrée de cette session : **143**, toutes vertes. Schéma de
`check --json` : **1**. Schéma de `status --json` : **1**. Les deux doivent le rester —
les findings `CASP-FACT-*` réutilisent la forme de finding existante.

L'espace de codes `CASP-FACT-*` est toujours entièrement libre ; `CASP-PROMPT-*` va désormais
jusqu'à `010`.

### Ce qui s'est réellement passé le 2026-07-20

Cinq incohérences, toutes coûteuses, toutes invisibles au validateur actuel.

| Ce qui a menti | Nature de la dérive | Attrapé par CASP ? |
|---|---|---|
| Un coût unitaire cité dans les documents de planification | Valeur **dérivée** d'un fichier de configuration, jamais recalculée après une migration de fournisseur qui divisait le coût source par quatre | Non |
| « Cette instrumentation n'existe pas encore » | Affirmation **vraie à l'écriture**, périmée dix jours plus tard par une release | Non |
| « Rebuild d'infrastructure toujours dû » | Ligne de prose dans un `roadmap.md`, vraie puis fausse, jamais revérifiée | Non |
| Un comptage de lignes en base | **Mesure sans provenance** — `n_live_tup` (estimation du planificateur PostgreSQL) lue comme un comptage exact ; le réel était ~40× supérieur | Non |
| Un pourcentage clé dans un document de synthèse | Chiffre ne se réconciliant avec **aucune** source ; la formule mécanique en donnait moins de la moitié | Non |
| Prompt sans frontmatter | Dérive structurelle | **Oui** (CASP-PROMPT-002) |

Le score est honnête : une sur six. Et la seule attrapée était la moins coûteuse.

Coût réel : une fausse mesure propagée dans cinq fichiers en quelques minutes, un plan
d'implémentation de six prompts bâti sur une prémisse périmée, et un chiffre de synthèse qui ne
survit pas à une multiplication.

### La contrainte de conception, non négociable

`casp lint` — la vérification prose contre réalité par LLM — est **explicitement coupé**
(`README.md`, section « Cut from earlier drafts, deliberately » ; `TODO.md`, rubrique
long-terme) : un verbe LLM dans le binaire casserait la promesse déterministe. Cette phase
respecte cette règle intégralement. **Rien de ce qui suit n'exige un modèle.**

> Références par section et non par numéro de ligne : le `README.md` a été réécrit deux fois
> depuis la rédaction de ce prompt, et la référence `README.md:285` qu'il portait pointait vers
> une ligne sans rapport au moment du rafraîchissement.

### Le renversement qui rend la chose possible

On ne peut pas prouver déterministiquement qu'une affirmation est **vraie**. On peut prouver
qu'elle a cessé d'être **vérifiée** :

- la source a-t-elle changé depuis la vérification ? → comparaison de hash ;
- la vérification a-t-elle dépassé sa durée de validité ? → comparaison de date ;
- la méthode de production est-elle enregistrée ? → test de présence.

Trois comparaisons, zéro modèle. C'est le même patron que `migrations_applied` : une
déclaration, une preuve sur disque, une règle qui compare les deux.

Le fait le plus dangereux n'est pas le fait faux — c'est le fait qui **a été** vrai. Et un fait
qui a été vrai est exactement ce qu'un hash de source et un TTL attrapent.

---

## SCOPE

### MUST

Une seule primitive nouvelle : `casp/facts.json`. Opt-in, comme `migrations_applied` — un
projet qui ne la pose pas ne voit aucune règle nouvelle et reste vert.

```jsonc
{
  "schema_version": 1,
  "facts": [
    {
      "id": "unit-cost-per-minute",
      "value": "0.012 USD/min",
      "source": "backend/config/pricing.json",
      "source_hash": "sha256:ab12…",     // hash de la source AU MOMENT de la vérification
      "method": "jq '.providers.current.cost_per_minute_usd' backend/config/pricing.json",
      "verified_at": "2026-07-20",
      "verified_commit": "0158df8",
      "ttl_days": 90,
      "used_in": [
        "docs/unit-economics.md",
        "docs/budget-allocation.md"
      ]
    },
    {
      "id": "cloud-monthly-cost",
      "value": "0 USD (free tier, 5000 unités incluses)",
      "source": "external:cloud-provider-billing",   // hors dépôt : pas de hash possible
      "method": "console du fournisseur → Billing → Statements",
      "verified_at": "2026-07-20",
      "ttl_days": 30                                 // le TTL est la SEULE garde ici
    }
  ]
}
```

**Les règles.** Codes stables suivant le registre existant (`src/rules.ts`), findings mappés
comme les autres.

| Code | Vérifie | Sévérité | Attrape quel cas du 20/07 |
|---|---|---|---|
| `CASP-FACT-001` | La source déclarée existe (chemin dans le dépôt), ou commence par `external:` | FAIL | Le pourcentage qui ne se réconcilie avec rien |
| `CASP-FACT-002` | `source_hash` == hash actuel de la source | **FAIL** | **Le coût unitaire jamais recalculé après migration de la configuration** |
| `CASP-FACT-003` | `verified_at + ttl_days` ≥ aujourd'hui | WARN, FAIL au double du TTL | « Rebuild toujours dû », la facture cloud, toute mesure externe |
| `CASP-FACT-004` | Chaque chemin de `used_in` existe **et** contient le marqueur `casp:fact <id>` | WARN | Un document dérivé supprimé ou renommé sans mise à jour |
| `CASP-FACT-005` | `method` est présent et non vide | WARN | Une valeur non reproductible |
| `CASP-FACT-006` | `method` ne correspond à aucun **piège connu** | FAIL | **`n_live_tup` lu comme un comptage** |

`CASP-FACT-002` est celle qui compte. C'est la seule qui aurait attrapé la sédimentation du
coût unitaire, et elle est purement mécanique : la source a bougé, le fait n'a pas été revu.

**Le marquage dans les documents dérivés** — un commentaire HTML, invisible au rendu :

```markdown
Le coût unitaire est de <!-- casp:fact unit-cost-per-minute -->0,012 $/min<!-- /casp:fact -->.
```

`CASP-FACT-004` vérifie que le marqueur est présent. Elle ne lit pas la valeur — c'est
volontaire : comparer un nombre dans de la prose exigerait de parser du langage naturel, donc
un modèle, donc la ligne rouge.

**Le registre des pièges** (`src/traps.ts`, données statiques, dans l'esprit de `src/rules.ts`
qui déclare *« No LLM, no network — this registry is static data »*). Motifs de méthodes qui
produisent des estimations qu'on lit comme des faits :

```
n_live_tup / n_dead_tup sans count(   → estimation du planificateur PostgreSQL
EXPLAIN sans ANALYZE                  → coût estimé, pas mesuré
reltuples                             → idem
docker stats --no-stream              → instantané, pas une moyenne
```

Extensible par projet via un champ `traps` optionnel dans `facts.json`. C'est le seul endroit
du protocole où CASP encode un savoir de domaine, et il reste déclaratif.

### SHOULD

**Compare-and-swap sur l'état (concurrence multi-agents).**

> **Rafraîchi le 2026-07-21.** La rédaction initiale décrivait `saveState()` comme un
> `writeFileSync` nu et demandait de le rendre atomique. **L'atomicité a été livrée en 0.12.1** :
> `saveState` (`src/shared.ts`) écrit désormais dans un fichier temporaire puis fait un `rename`,
> atomique au sein d'un système de fichiers, ce qui protège `ship`, `close`, `audit` et `upgrade`
> d'un état tronqué par un plantage ou un disque plein. **Ne pas ré-implémenter cette partie.**

Ce qui reste ouvert est l'autre moitié, et c'est celle que l'incident du 20/07 a réellement
exhibée : l'atomicité protège d'une écriture **partielle**, pas d'une écriture **écrasée**. Il
n'y a toujours ni verrou ni compare-and-swap. Le modèle implicite reste « un agent, une session,
une branche ». La réalité observée : deux agents écrivaient dans le `casp/` du même cockpit en
parallèle, et le second a corrigé le premier — par chance, pas par conception. Le mode
multi-agents parallèles est un mode d'usage réel, pas un cas d'école.

Correctif minimal, sans nouveau concept, par-dessus l'écriture atomique existante : mémoriser le
hash du fichier tel qu'il a été lu au chargement, et le revérifier juste avant le `rename`. Si la
source a bougé entre-temps, refus avec un message actionnable (« l'état a changé depuis la
lecture, relancez ») et aucune écriture. Pas de lock, pas de CRDT, pas de merge — juste un refus
honnête. La fenêtre TOCTOU résiduelle est acceptée : elle est étroite, et un CLI local n'a pas à
prétendre à la sérialisabilité.

**`casp fact` — les verbes.** Cohérents avec la grammaire existante (une syllabe, lecture
seule par défaut) :

```
casp fact list [--json]        inventaire, avec l'état de fraîcheur de chacun
casp fact check                les règles FACT seules (sous-ensemble de casp check)
casp fact verify <id>          rejoue la méthode, met à jour hash + date, exige confirmation
casp fact stale [--json]       ce qui a expiré ou dont la source a bougé — la liste de travail
```

`casp fact verify` est le seul verbe mutant. Il ne devine rien : il exécute la `method`
déclarée, montre l'avant/après, et demande confirmation — même posture que `casp close`.

### DEFER

- Comparer la **valeur** du fait au contenu du document dérivé. Exige de parser la prose. Ligne
  rouge.
- Toute forme de résolution floue. Le refus est désormais un précédent établi **deux fois** —
  `CASP-SESSION-003` (livré en 0.11.0) puis `CASP-PROMPT-007` (livré en 0.13.0) : si la
  correspondance a besoin d'une supposition, il n'y a pas de finding. Un chemin de `source` ou de
  `used_in` se résout exactement, ou pas du tout.
- Un dépôt central de faits partagé entre cockpits. Attendre un besoin réel.
- La détection automatique de faits dans les documents existants. Le marquage est manuel et
  délibéré : ce qui compte assez pour être vérifié mérite d'être déclaré.

---

## DO NOT

- **Ne pas ajouter de LLM**, sous aucune forme, même consultative, même optionnelle.
- **Ne pas rendre `facts.json` obligatoire.** Un cockpit sans ce fichier ne voit aucune règle
  nouvelle. L'adoption meurt de la contrainte imposée d'un coup.
- **Ne pas faire rougir les historiques.** Deux catégories l'ont déjà fait correctement —
  `CASP-SESSION-003` (0.11.0) et `CASP-PROMPT-007` … `010` (0.13.0) : dans les deux cas
  l'adoption est **dérivée des données**, sans clé d'état, et un dépôt qui n'a rien déclaré
  n'émet **aucun finding, pas même un PASS**. Lire ces deux implémentations avant de coder
  celle-ci ; le comportement pré-adoption se règle **avant** le reste, pas après.
- Ne pas prétendre que cette couche prouve la vérité. Elle prouve la **fraîcheur**. La
  documentation doit être aussi explicite sur cette limite que `docs/what-casp-proves.md` l'est
  aujourd'hui sur les siennes.

---

## VERIFY

Tests attendus, chacun rejouant un cas réel du 20/07 :

- source modifiée après vérification → `CASP-FACT-002` FAIL ;
- fait expiré → WARN, puis FAIL au double du TTL ;
- `used_in` pointant vers un fichier sans marqueur → `CASP-FACT-004` WARN ;
- `method` contenant `n_live_tup` sans `count(` → `CASP-FACT-006` FAIL ;
- source `external:` sans `ttl_days` → FAIL (sinon le fait n'est jamais revérifiable) ;
- **cockpit sans `facts.json` → aucune règle FACT émise, verdict inchangé** ;
- `saveState` avec état modifié entre lecture et écriture → refus, aucune écriture du tout.

À l'entrée de la session, **143 tests** passent. Elles doivent toutes rester vertes, le schéma
de `check --json` rester à **1**, et le rapport humain d'un dépôt sans `facts.json` rester
identique octet pour octet.

---

## Ce que cette couche ne résoudra pas

À écrire dans `docs/what-casp-proves.md` en même temps que le code.

L'erreur du 20/07 — lire `n_live_tup` comme un comptage — était une **erreur de jugement**, pas
de fraîcheur. Le registre des pièges l'aurait attrapée parce que ce piège-là est connu et
catalogué. Le prochain piège inconnu passera. `CASP-FACT-005` (méthode enregistrée) rend
l'erreur **auditable après coup**, ce qui est déjà beaucoup — ce jour-là, aucune trace ne
disait d'où venait le chiffre.

De même, un fait dont la source n'a pas bougé et dont le TTL court peut être **faux depuis le
premier jour**. CASP dira « frais ». Il aura raison, et il aura tort. La couche déplace la
question de « est-ce vrai ? » vers « quand quelqu'un l'a-t-il vérifié, comment, et la source
a-t-elle bougé depuis ? ». C'est un progrès considérable et ce n'est pas la vérité.
