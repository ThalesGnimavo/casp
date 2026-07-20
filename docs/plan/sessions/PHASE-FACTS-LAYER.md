---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-07-20
next_after: check-shipped-log
parent_prompt: null
---

# PHASE — Facts layer : prouver la fraîcheur, pas la vérité

> **Origine** : incident réel du 2026-07-20 sur un cockpit de production. Une journée entière de
> travail a été bâtie sur cinq affirmations fausses, **sans que `casp check` ne signale quoi que
> ce soit** — parce qu'aucune n'était une dérive d'état. `state.json` contre git était juste
> toute la journée. Ce qui mentait vivait dans les documents *autour* du cockpit.

---

## CONTEXT

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
(`README.md:285`, `TODO.md:114`) : un verbe LLM dans le binaire casserait la promesse
déterministe. Cette phase respecte cette règle intégralement. **Rien de ce qui suit n'exige un
modèle.**

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

**Écriture atomique de l'état (concurrence multi-agents).** `saveState()`
(`src/shared.ts:184-186`) fait un `writeFileSync` nu, sans verrou ni compare-and-swap. Le modèle
implicite est « un agent, une session, une branche ». La réalité observée le 20/07 : deux agents
écrivaient dans le `casp/` du même cockpit en parallèle, et le second a corrigé le premier — par
chance, pas par conception. Le mode multi-agents parallèles est un mode d'usage réel, pas un cas
d'école.

Correctif minimal, sans nouveau concept : `saveState` relit le fichier et compare son hash à
celui lu au chargement. Si différent, refus avec un message actionnable (« l'état a changé
depuis la lecture, relancez »). Pas de lock, pas de CRDT, pas de merge — juste un refus honnête.

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
- Toute forme de résolution floue. La règle du prompt `check-shipped-log` s'applique :
  *« pas de matching flou — si ça a besoin d'une supposition, on stoppe et on repense »*.
- Un dépôt central de faits partagé entre cockpits. Attendre un besoin réel.
- La détection automatique de faits dans les documents existants. Le marquage est manuel et
  délibéré : ce qui compte assez pour être vérifié mérite d'être déclaré.

---

## DO NOT

- **Ne pas ajouter de LLM**, sous aucune forme, même consultative, même optionnelle.
- **Ne pas rendre `facts.json` obligatoire.** Un cockpit sans ce fichier ne voit aucune règle
  nouvelle. L'adoption meurt de la contrainte imposée d'un coup.
- **Ne pas faire rougir les historiques.** Comme pour `check-shipped-log`, régler le
  comportement sur les projets pré-adoption **avant** de coder.
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
- `saveState` avec état modifié entre lecture et écriture → refus, aucune écriture partielle.

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
