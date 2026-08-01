import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Licences et sources · Atelier des mots",
  description:
    "Sources, licences, dates d’accès et transformations des corpus utilisés par Atelier des mots.",
};

type CorpusGroup = {
  title: string;
  ids: string[];
  source: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  version: string;
  transformations: string;
  attribution: string;
  warning?: string;
};

const corpusGroups: CorpusGroup[] = [
  {
    title: "Mots français, allemands et espagnols",
    ids: ["fr-mots", "de-mots", "es-mots"],
    source: "Listes de fréquence de Wiktionary",
    sourceUrl:
      "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    version: "Exports non consignés · import du 28 juillet 2026",
    transformations:
      "Agrégation via most-common-words-by-language, normalisation, filtrage et dédoublonnage.",
    attribution:
      "Contributeurs de Wiktionary ; Matthias Buchmeier pour les listes allemandes et espagnoles.",
  },
  {
    title: "Mots italiens, japonais et russes",
    ids: [
      "it-mots",
      "ja-mots-romaji",
      "ru-mots-cyrillique",
      "ru-mots-romanise",
    ],
    source: "FrequencyWords · contenu OpenSubtitles",
    sourceUrl: "https://github.com/hermitdave/FrequencyWords",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    version: "content/2016 · import du 28 juillet 2026",
    transformations:
      "Sélection, normalisation, dédoublonnage et romanisation des variantes concernées.",
    attribution: "Hermit Dave et contributeurs d’OpenSubtitles.",
  },
  {
    title: "Mots anglais",
    ids: ["en-mots"],
    source: "Google 10,000 English · first20hours",
    sourceUrl: "https://github.com/first20hours/google-10000-english",
    license: "Licence amont spécifique",
    licenseUrl:
      "https://github.com/first20hours/google-10000-english/blob/master/LICENSE.md",
    version: "Export non consigné · import du 28 juillet 2026",
    transformations: "Normalisation et dédoublonnage ; contenu inchangé le 1er août 2026.",
    attribution:
      "Google Web Trillion Word Corpus, Peter Norvig et Josh Kaufman.",
    warning:
      "Conservé pour un usage personnel et non commercial. La redistribution commerciale n’est pas clairement couverte par la licence amont.",
  },
  {
    title: "Prénoms multilingues",
    ids: [
      "fr-prenoms",
      "en-prenoms",
      "de-prenoms",
      "it-prenoms",
      "es-prenoms",
      "ja-prenoms-romaji",
      "ru-prenoms-cyrillique",
      "ru-prenoms-romanise",
    ],
    source: "@faker-js/faker",
    sourceUrl: "https://github.com/faker-js/faker",
    license: "MIT",
    licenseUrl: "https://github.com/faker-js/faker/blob/next/LICENSE",
    version: "Version non consignée · import du 28 juillet 2026",
    transformations:
      "Normalisation, dédoublonnage et romanisation des variantes concernées.",
    attribution:
      "Faker contributors, Marak Squires et auteurs amont cités dans la licence.",
  },
  {
    title: "Voies de Londres",
    ids: ["en-rues-routes"],
    source: "Wikimedia Commons · Streets in London by name",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/Category:Streets_in_London_by_name",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    version: "Catégories alphabétiques · import du 1er août 2026",
    transformations:
      "Sélection de titres, retrait des précisions géographiques, normalisation et dédoublonnage.",
    attribution: "Contributeurs et historiques des pages de Wikimedia Commons.",
  },
  {
    title: "Voies de Moscou romanisées",
    ids: ["ru-rues-routes-romanise"],
    source: "Wikimedia Commons · Streets in Moscow by name",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/Category:Streets_in_Moscow_by_name",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    version: "État non consigné · import du 28 juillet 2026",
    transformations:
      "Extraction des titres, romanisation, normalisation et dédoublonnage.",
    attribution: "Contributeurs et historiques des pages de Wikimedia Commons.",
  },
  {
    title: "Villes, bourgs et villages de France",
    ids: ["fr-lieux-villes", "fr-lieux-villages"],
    source: "Découpage administratif · Etalab / INSEE",
    sourceUrl: "https://github.com/datagouv/decoupage-administratif",
    license: "Licence Ouverte 2.0",
    licenseUrl: "https://www.data.gouv.fr/pages/legal/licences/etalab-2.0",
    version: "Export non consigné · accès du 29 juillet 2026",
    transformations:
      "Filtrage par territoire et population, tri ou échantillonnage déterministe.",
    attribution: "Etalab / INSEE · données modifiées.",
  },
  {
    title: "Rivières et montagnes de France",
    ids: ["fr-lieux-rivieres", "fr-lieux-montagnes"],
    source: "GeoNames · export FR.txt",
    sourceUrl: "https://download.geonames.org/export/dump/FR.zip",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    version: "Export quotidien récupéré le 29 juillet 2026",
    transformations:
      "Filtrage des types géographiques et échantillonnage déterministe.",
    attribution: "GeoNames · données modifiées.",
  },
  {
    title: "Fleuves et minéraux",
    ids: ["fr-lieux-fleuves", "fr-nature-mineraux"],
    source: "Wikipédia en français",
    sourceUrl: "https://fr.wikipedia.org/",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    version: "Révisions non consignées · accès du 29 juillet 2026",
    transformations:
      "Extraction de listes et tableaux, nettoyage des annotations, sélection et dédoublonnage.",
    attribution: "Contributeurs et historiques des articles sources.",
  },
];

export default function LicensesPage() {
  return (
    <div className="site-shell licenses-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Atelier des mots, accueil">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Atelier des mots</span>
        </Link>
        <nav aria-label="Navigation principale">
          <Link href="/">Générateur</Link>
          <Link href="/lieux">Lieux</Link>
          <Link href="/analyse">Analyse</Link>
          <Link className="is-active" href="/licences">Licences</Link>
        </nav>
        <span className="lab-badge" aria-label="Inventaire vérifié">LIC</span>
      </header>

      <main>
        <section className="licenses-hero" aria-labelledby="licenses-title">
          <div>
            <p className="eyebrow">Traçabilité des corpus</p>
            <h1 id="licenses-title">Des sources ouvertes, des règles visibles.</h1>
            <p>
              Chaque liste indique sa provenance, sa licence, la date connue de
              l’import et les transformations appliquées.
            </p>
          </div>
          <dl className="licenses-summary" aria-label="Résumé de l’inventaire">
            <div><dt>Corpus actifs</dt><dd>24</dd></div>
            <div><dt>Corpus suspendus</dt><dd>3</dd></div>
            <div><dt>Dernière vérification</dt><dd>01.08.2026</dd></div>
          </dl>
        </section>

        <section className="licenses-callout" aria-labelledby="code-license-title">
          <div>
            <p className="section-index">Code de l’application</p>
            <h2 id="code-license-title">Licence MIT</h2>
          </div>
          <p>
            Le code peut être utilisé, modifié et auto-hébergé sous licence MIT.
            Les fichiers de données conservent les licences décrites ci-dessous.
          </p>
          <a href="https://github.com/AlexandreDor/atelier-des-mots/blob/main/LICENSE">
            Lire la licence du code
          </a>
        </section>

        <section className="licenses-section" aria-labelledby="active-corpora-title">
          <div className="licenses-heading">
            <div>
              <p className="section-index">Corpus distribués</p>
              <h2 id="active-corpora-title">Sources actives</h2>
            </div>
            <p>
              Les fichiers dérivés de CC BY-SA sont eux-mêmes distribués sous
              CC BY-SA 4.0 ; le code indépendant reste sous MIT.
            </p>
          </div>

          <div className="licenses-grid">
            {corpusGroups.map((group) => (
              <article className={group.warning ? "has-warning" : ""} key={group.title}>
                <div className="license-card-heading">
                  <h3>{group.title}</h3>
                  <a href={group.licenseUrl}>{group.license}</a>
                </div>
                <p className="license-ids">
                  {group.ids.map((id) => <code key={id}>{id}</code>)}
                </p>
                <dl>
                  <div><dt>Source</dt><dd><a href={group.sourceUrl}>{group.source}</a></dd></div>
                  <div><dt>Version</dt><dd>{group.version}</dd></div>
                  <div><dt>Transformations</dt><dd>{group.transformations}</dd></div>
                  <div><dt>Attribution</dt><dd>{group.attribution}</dd></div>
                </dl>
                {group.warning && <p className="license-warning">{group.warning}</p>}
              </article>
            ))}
          </div>
        </section>

        <section className="licenses-suspended" aria-labelledby="suspended-title">
          <div>
            <p className="section-index">Précaution</p>
            <h2 id="suspended-title">TAXREF suspendu</h2>
          </div>
          <div>
            <p>
              Les listes d’animaux, de plantes et de champignons ont été retirées
              des fichiers distribués. La fiche TAXREF affiche CC BY 4.0 tout en
              interdisant la transmission d’une copie et la mise en ligne sans
              autorisation préalable.
            </p>
            <p className="license-ids">
              <code>fr-nature-animaux</code>
              <code>fr-nature-plantes</code>
              <code>fr-nature-champignons</code>
            </p>
            <a href="https://www.gbif.org/dataset/0e61f8fe-7d25-4f81-ada7-d970bbb2c6d6">
              Consulter la fiche TAXREF
            </a>
          </div>
        </section>
      </main>

      <footer>
        <span>Inventaire révisé le 1er août 2026.</span>
        <span>
          <a href="https://github.com/AlexandreDor/atelier-des-mots/blob/main/DATA_LICENSES.md">
            Manifeste complet
          </a>
          {" · "}
          <Link href="/">Retour au générateur</Link>
        </span>
      </footer>
    </div>
  );
}
