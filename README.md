# Atelier des mots

[Ouvrir Atelier des mots](https://atelier-des-mots.alexandre-dorier.chatgpt.site)

Générateur et laboratoire d’analyse pour inventer des mots, comparer des
dictionnaires, créer des noms de lieux d’inspiration française et explorer le
vocabulaire de la nature.

## Nature et sciences

Le quatrième thème du générateur contient actuellement un dictionnaire français
de minéraux extrait de la
[liste Wikipédia](https://fr.wikipedia.org/wiki/Liste_de_min%C3%A9raux)
(CC BY-SA 4.0).

Les anciens corpus d’animaux, de plantes et de champignons dérivés de TAXREF
sont suspendus : les conditions affichées par la source contredisent sa licence
CC BY 4.0 sur la redistribution en ligne. Le détail est consigné dans
[`DATA_LICENSES.md`](DATA_LICENSES.md). Le script
`scripts/build-nature-dictionaries.mjs` reconstruit uniquement le corpus de
minéraux à partir des pages alphabétiques de la liste.

## Noms de lieux

La route `/lieux` propose trois générateurs spécialisés :

- villes et villages ;
- rivières et fleuves ;
- montagnes.

Les corpus intégrés réunissent désormais des toponymes français, anglais,
hongrois, espagnols et russes romanisés. Les communes françaises proviennent
du [découpage administratif Etalab](https://github.com/datagouv/decoupage-administratif)
(Code officiel géographique de l’INSEE, Licence Ouverte), les cours d’eau et
reliefs ainsi que les localités russes de
[GeoNames](https://www.geonames.org/) (CC BY 4.0), et la distinction
des fleuves de la
[liste Wikipédia](https://fr.wikipedia.org/wiki/Liste_de_fleuves_de_France)
(CC BY-SA).

Le script `scripts/build-place-dictionaries.mjs` permet de reconstruire les
corpus français à partir des trois exports sources. Il nettoie les désignations
génériques des forêts, montagnes et plages avant le dédoublonnage. Les corpus
de villes anglaises, hongroises et espagnoles sont construits depuis les
exports GeoNames. Les voies hongroises et espagnoles proviennent des extraits
OpenStreetMap de [Geofabrik](https://download.geofabrik.de/europe.html) et
conservent les noms officiels locaux espagnols ; les termes comme « rue »,
« avenue », `utca` ou `calle` sont retirés avant l’échantillonnage.

Les exports peuvent être téléchargés dans un répertoire de travail (ils ne sont
pas versionnés) avec :

```bash
curl -fLO https://download.geonames.org/export/dump/GB.zip
curl -fLO https://download.geonames.org/export/dump/HU.zip
curl -fLO https://download.geonames.org/export/dump/ES.zip
curl -fLO https://download.geonames.org/export/dump/FR.zip
for archive in GB HU ES FR; do unzip -o "$archive.zip"; done
curl -fLo hungary-latest.osm.pbf https://download.geofabrik.de/europe/hungary-latest.osm.pbf
curl -fLo spain-latest.osm.pbf https://download.geofabrik.de/europe/spain-latest.osm.pbf
curl -fLo canary-islands-latest.osm.pbf https://download.geofabrik.de/africa/canary-islands-latest.osm.pbf
```

Pour préparer les voies à partir des PBF Geofabrik, installer `osmium` puis
filtrer les objets `way` portant un tag `highway` et exporter en GeoJSON Text
Sequence. Le script conserve ensuite uniquement `motorway`, `trunk`,
`primary`, `secondary`, `tertiary`, `unclassified`, `residential`,
`living_street`, `service`, `road`, `pedestrian` et `track`; il ignore `ref`,
les objets sans `name`, ainsi que les chemins piétons/cyclables et les voies
`proposed` ou `construction`. Pour l’Espagne, agréger également l’extrait des
[Canaries](https://download.geofabrik.de/africa/canary-islands.html).

```bash
osmium tags-filter hungary-latest.osm.pbf w/highway -o hu-highways.osm.pbf
osmium export hu-highways.osm.pbf -f geojsonseq -o hu-highways.geojsonseq
osmium tags-filter spain-latest.osm.pbf w/highway -o es-highways.osm.pbf
osmium export es-highways.osm.pbf -f geojsonseq -o es-highways.geojsonseq
osmium tags-filter canary-islands-latest.osm.pbf w/highway -o canary-highways.osm.pbf
osmium export canary-highways.osm.pbf -f geojsonseq -o canary-highways.geojsonseq
```

La reconstruction internationale s’effectue ensuite avec :

```bash
node scripts/build-international-place-dictionaries.mjs \
  GB.txt HU.txt ES.txt \
  hu-highways.geojsonseq \
  es-highways.geojsonseq \
  canary-highways.geojsonseq
```

La reconstruction française s’effectue avec les exports administratifs et
hydrographiques déjà préparés :

```bash
node scripts/build-place-dictionaries.mjs communes.json FR.txt fleuves.html
```

Le corpus russe peut
être reconstruit avec :

```bash
node scripts/build-russian-place-dictionary.mjs RU.txt
```

Le générateur principal propose également un corpus de 3 337 noms de voies
londoniennes extrait de Wikimedia Commons (CC BY-SA 4.0), dans le thème
« Lieux ».

## Licences

- Le code est distribué sous [licence MIT](LICENSE).
- Les sources, versions connues, dates d’accès, transformations et licences de
  chaque corpus sont décrites dans [`DATA_LICENSES.md`](DATA_LICENSES.md).
- Les voies extraites d’OpenStreetMap restent identifiées sous ODbL 1.0 et
  conservent l’attribution « © OpenStreetMap contributors ».
- Les avis MIT des outils et données amont sont conservés dans
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- Une synthèse lisible est également disponible sur la route `/licences` du
  site.

Le corpus anglais de mots courants (`en-mots`) est volontairement conservé sans
modification pour un usage personnel et non commercial ; sa licence amont
spécifique reste signalée dans le manifeste.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and verify the rendered development-preview metadata
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
