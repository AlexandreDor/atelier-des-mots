import type { Metadata } from "next";
import Link from "next/link";
import inventoryData from "../data/dictionary-inventory.json";

export const metadata: Metadata = {
  title: "Licences et sources · Atelier des mots",
  description:
    "Sources, licences, empreintes et transformations des corpus utilisés par Atelier des mots.",
};

type Corpus = {
  id: string;
  name: string;
  wordCount?: number;
  source?: string;
  sourceUrl?: string;
  license?: string;
  licenseUrl?: string;
  sourceVersion?: string;
  accessedAt?: string;
  sourceSnapshots?: { file: string; sha256: string; capturedAt: string }[];
  transformations?: string;
  attribution?: string;
  usageRestriction?: string;
  suspensionReason?: string;
  status?: string;
};

const inventory = inventoryData as { active: Corpus[]; suspended: Corpus[] };
const { active: activeCorpora, suspended: suspendedCorpora } = inventory;
const corpusWordCount = (corpus: Corpus) => corpus.wordCount ?? 0;

function CorpusCard({ corpus, suspended: isSuspended = false }: { corpus: Corpus; suspended?: boolean }) {
  return (
    <article className={isSuspended ? "has-warning" : ""} key={corpus.id}>
      <div className="license-card-heading">
        <h3>{corpus.name}</h3>
        {corpus.licenseUrl ? (
          <a href={corpus.licenseUrl}>{corpus.license}</a>
        ) : (
          <span>{corpus.license}</span>
        )}
      </div>
      <p className="license-ids"><code>{corpus.id}</code> · {corpusWordCount(corpus).toLocaleString("fr-FR")} mots</p>
      <dl>
        <div><dt>Source</dt><dd>{corpus.sourceUrl ? <a href={corpus.sourceUrl}>{corpus.source}</a> : corpus.source}</dd></div>
        <div><dt>État source</dt><dd>{corpus.sourceVersion || "Version amont non consignée"}{corpus.accessedAt ? ` · accès ${corpus.accessedAt}` : ""}</dd></div>
        {corpus.sourceSnapshots?.map((snapshot) => <div key={`${corpus.id}:${snapshot.file}`}><dt>SHA-256 · {snapshot.file}</dt><dd><code>{snapshot.sha256}</code> · empreinte calculée le {snapshot.capturedAt}</dd></div>)}
        {corpus.transformations && <div><dt>Transformations</dt><dd>{corpus.transformations}</dd></div>}
        {corpus.attribution && <div><dt>Attribution</dt><dd>{corpus.attribution}</dd></div>}
      </dl>
      {isSuspended && <p className="license-warning">Suspendu : {corpus.suspensionReason || corpus.usageRestriction}</p>}
      {!isSuspended && corpus.usageRestriction && <p className="license-warning">Restriction : {corpus.usageRestriction}</p>}
    </article>
  );
}

export default function LicensesPage() {
  const activeWords = activeCorpora.reduce((count, corpus) => count + corpusWordCount(corpus), 0);
  const suspendedWords = suspendedCorpora.reduce((count, corpus) => count + corpusWordCount(corpus), 0);
  return (
    <div className="site-shell licenses-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Atelier des mots, accueil"><span className="brand-mark" aria-hidden="true">A</span><span>Atelier des mots</span></Link>
        <nav aria-label="Navigation principale"><Link href="/">Générateur</Link><Link href="/lieux">Lieux</Link><Link href="/analyse">Analyse</Link><Link className="is-active" href="/licences">Licences</Link></nav>
        <span className="lab-badge" aria-label="Inventaire des sources">LIC</span>
      </header>
      <main>
        <section className="licenses-hero" aria-labelledby="licenses-title">
          <div><p className="eyebrow">Traçabilité des corpus</p><h1 id="licenses-title">Sources, licences et état des données.</h1><p>L’inventaire est rendu depuis les métadonnées intégrées avec les corpus. Les empreintes identifient les fichiers sources employés lors d’une reconstruction.</p></div>
          <dl className="licenses-summary" aria-label="Résumé de l’inventaire">
            <div><dt>Corpus actifs</dt><dd>{activeCorpora.length}</dd></div><div><dt>Mots actifs</dt><dd>{activeWords.toLocaleString("fr-FR")}</dd></div><div><dt>Corpus suspendus</dt><dd>{suspendedCorpora.length}</dd></div><div><dt>Mots suspendus</dt><dd>{suspendedWords.toLocaleString("fr-FR")}</dd></div>
          </dl>
        </section>
        <section className="licenses-callout" aria-labelledby="code-license-title"><div><p className="section-index">Code de l’application</p><h2 id="code-license-title">Licence MIT</h2></div><p>Le code peut être utilisé, modifié et auto-hébergé sous licence MIT. Les corpus conservent les licences et restrictions indiquées sur chaque fiche.</p><a href="https://github.com/AlexandreDor/atelier-des-mots/blob/main/LICENSE">Lire la licence du code</a></section>
        <section className="licenses-section" aria-labelledby="active-corpora-title"><div className="licenses-heading"><div><p className="section-index">Corpus distribués</p><h2 id="active-corpora-title">Sources actives</h2></div></div><div className="licenses-grid">{activeCorpora.map((corpus) => <CorpusCard corpus={corpus} key={corpus.id} />)}</div></section>
        {suspendedCorpora.length > 0 && <section className="licenses-suspended" aria-labelledby="suspended-title"><div><p className="section-index">Distribution suspendue</p><h2 id="suspended-title">Corpus retenus</h2></div><div className="licenses-grid">{suspendedCorpora.map((corpus) => <CorpusCard corpus={corpus} suspended key={corpus.id} />)}</div></section>}
      </main>
      <footer><span>Inventaire généré depuis les métadonnées des corpus.</span><span><a href="https://github.com/AlexandreDor/atelier-des-mots/blob/main/DATA_LICENSES.md">Manifeste complet</a> · <Link href="/">Retour au générateur</Link></span></footer>
    </div>
  );
}
