"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import placeDictionaryData from "../data/place-dictionaries.json";
import {
  Algorithm,
  GeneratorConfig,
  WeightedSource,
  generateBatch,
  prepareModel,
} from "../generator";

type PlaceLanguage = "fr";
type PlaceType = "settlement" | "water" | "mountain";
type PlaceStructure = "simple" | "compound" | "territorial";

type Dictionary = {
  id: string;
  name: string;
  words: string[];
};

const PLACE_DICTIONARIES = placeDictionaryData as Dictionary[];

const LANGUAGE_OPTIONS: {
  id: PlaceLanguage;
  label: string;
  detail: string;
}[] = [
  {
    id: "fr",
    label: "Français",
    detail: "Noms en français · lieux situés en France",
  },
];

const TYPE_OPTIONS: {
  id: PlaceType;
  index: string;
  label: string;
  description: string;
}[] = [
  {
    id: "settlement",
    index: "01",
    label: "Ville ou village",
    description: "Communes, bourgs et hameaux",
  },
  {
    id: "water",
    index: "02",
    label: "Rivière ou fleuve",
    description: "Cours d’eau de toutes tailles",
  },
  {
    id: "mountain",
    index: "03",
    label: "Montagne",
    description: "Monts, pics et reliefs",
  },
];

const STRUCTURE_OPTIONS: {
  id: PlaceStructure;
  label: string;
  help: string;
}[] = [
  {
    id: "simple",
    label: "Simple",
    help: "Génère un nom seul, sans préfixe ni second nom.",
  },
  {
    id: "compound",
    label: "Composé",
    help: "Ajoute une forme française adaptée au lieu, comme « Mont », « Val » ou « Rivière de ».",
  },
  {
    id: "territorial",
    label: "Territorial",
    help: "Associe deux noms avec une liaison géographique, comme « sur », « de » ou un trait d’union.",
  },
];

const INITIAL_RESULTS = [
  "Valebrune",
  "Saint-Orvel",
  "Montaulne",
  "Clairive",
  "Bellecombe",
  "Rochevay",
  "Aubecourt",
  "Viremont",
  "Séranne",
];

function createSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `carte-${values[0].toString(36)}-${values[1].toString(36)}`;
  }
  return `carte-${Date.now().toString(36)}`;
}

function normalizeGenerationCount(value: number) {
  return Math.min(300, Math.max(3, Math.round(value / 3) * 3));
}

function seededRandom(seed: string) {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.codePointAt(0) ?? 0;
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(values: T[], random: () => number) {
  return values[Math.floor(random() * values.length)];
}

function titleCase(value: string) {
  return value
    .split(/([ -])/)
    .map((part) =>
      /^[\p{L}]/u.test(part)
        ? `${part[0].toLocaleUpperCase("fr-FR")}${part.slice(1)}`
        : part,
    )
    .join("");
}

function dictionary(id: string, weight = 1): WeightedSource {
  const source = PLACE_DICTIONARIES.find((item) => item.id === id);
  if (!source) throw new Error(`Dictionnaire manquant : ${id}`);
  return { ...source, weight };
}

function sourcesFor(type: PlaceType) {
  if (type === "settlement") {
    return [
      dictionary("fr-lieux-villes", 1.2),
      dictionary("fr-lieux-villages", 1),
    ];
  }
  if (type === "water") {
    return [
      dictionary("fr-lieux-rivieres", 1.3),
      dictionary("fr-lieux-fleuves", 0.8),
    ];
  }
  return [dictionary("fr-lieux-montagnes")];
}

function formatPlaceName(
  core: string,
  companion: string,
  type: PlaceType,
  structure: PlaceStructure,
  random: () => number,
) {
  const first = titleCase(core);
  const second = titleCase(companion);

  if (structure === "simple") return first;

  if (type === "settlement") {
    if (structure === "compound") {
      const prefixes = [
        "Bel",
        "Belle",
        "Bois",
        "Font",
        "Mont",
        "Roche",
        "Saint",
        "Sainte",
        "Val",
      ];
      return `${pick(prefixes, random)}-${first}`;
    }
    const links = [
      `sur-${second}`,
      `en-${second}`,
      `sous-${second}`,
      `de-${second}`,
    ];
    return `${first}-${pick(links, random)}`;
  }

  if (type === "water") {
    if (structure === "compound") {
      const forms = [
        "Bief de",
        "Bras de",
        "Gave de",
        "Rivière de",
        "Ruisseau de",
        "Torrent de",
      ];
      return `${pick(forms, random)} ${first}`;
    }
    return `${first} de ${second}`;
  }

  if (structure === "compound") {
    const forms = [
      "Aiguille de",
      "Cime de",
      "Crêt de",
      "Dent de",
      "Mont",
      "Pic de",
      "Pointe de",
      "Puy",
      "Roc de",
      "Sommet de",
    ];
    return `${pick(forms, random)} ${first}`;
  }
  return `${first}-${second}`;
}

function buildNames({
  type,
  structure,
  algorithm,
  order,
  temperature,
  interpolation,
  minLength,
  maxLength,
  count,
  seed,
}: {
  type: PlaceType;
  structure: PlaceStructure;
  algorithm: Algorithm;
  order: number;
  temperature: number;
  interpolation: number;
  minLength: number;
  maxLength: number;
  count: number;
  seed: string;
}) {
  const config: GeneratorConfig = {
    algorithm,
    order,
    temperature,
    interpolation,
    minLength,
    maxLength,
    count: Math.max(36, Math.min(1200, count * 4)),
    seed,
    constraints: {
      startsWith: "",
      endsWith: "",
      includes: "",
      excludes: "",
      allowDictionaryWords: false,
    },
  };
  const model = prepareModel(sourcesFor(type), config);
  const cores = generateBatch(model, config);
  const random = seededRandom(
    `${seed}:${type}:${structure}:${algorithm}:${order}:${temperature}:${interpolation}`,
  );
  const names = new Set<string>();

  if (cores.length === 0) return [];

  for (let index = 0; index < cores.length && names.size < count; index += 1) {
    const companion = cores[(index + 5) % cores.length] ?? cores[0];
    names.add(
      formatPlaceName(
        cores[index],
        companion,
        type,
        structure,
        random,
      ),
    );
  }
  return Array.from(names);
}

export default function PlacesPage() {
  const [language, setLanguage] = useState<PlaceLanguage>("fr");
  const [type, setType] = useState<PlaceType>("settlement");
  const [structure, setStructure] = useState<PlaceStructure>("simple");
  const [algorithm, setAlgorithm] = useState<Algorithm>("markov");
  const [order, setOrder] = useState(2);
  const [temperature, setTemperature] = useState(0.9);
  const [interpolation, setInterpolation] = useState(0.7);
  const [minLength, setMinLength] = useState(5);
  const [maxLength, setMaxLength] = useState(10);
  const [count, setCount] = useState(9);
  const [seed, setSeed] = useState("");
  const [lastSeed, setLastSeed] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);
  const [results, setResults] = useState(INITIAL_RESULTS);
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const selectedType = useMemo(
    () => TYPE_OPTIONS.find((option) => option.id === type) ?? TYPE_OPTIONS[0],
    [type],
  );
  const corpusSize = useMemo(
    () =>
      sourcesFor(type).reduce(
        (total, source) => total + source.words.length,
        0,
      ),
    [type],
  );
  const selectedStructure =
    STRUCTURE_OPTIONS.find((option) => option.id === structure) ??
    STRUCTURE_OPTIONS[0];

  function generate() {
    const resolvedSeed = seed.trim() || createSeed();
    setLastSeed(resolvedSeed);
    setResults(
      buildNames({
        type,
        structure,
        algorithm,
        order,
        temperature,
        interpolation,
        minLength,
        maxLength,
        count,
        seed: resolvedSeed,
      }),
    );
  }

  async function copyName(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedName(name);
      window.setTimeout(
        () => setCopiedName((current) => (current === name ? null : current)),
        1800,
      );
    } catch {
      setCopiedName(null);
    }
  }

  async function copyLastSeed() {
    if (!lastSeed) return;
    try {
      await navigator.clipboard.writeText(lastSeed);
      setSeedCopied(true);
      window.setTimeout(() => setSeedCopied(false), 1800);
    } catch {
      setSeedCopied(false);
    }
  }

  function randomize() {
    const random = seededRandom(createSeed());
    const nextAlgorithm = pick<Algorithm>(
      ["markov", "interpolated", "syllabic", "phonetic"],
      random,
    );
    const nextMinimum = pick([3, 4, 5, 6, 7], random);
    setType(pick(TYPE_OPTIONS, random).id);
    setStructure(pick(STRUCTURE_OPTIONS, random).id);
    setAlgorithm(nextAlgorithm);
    setOrder(
      nextAlgorithm === "syllabic"
        ? 2
        : Math.floor(random() * (nextAlgorithm === "phonetic" ? 3 : 5)) + 1,
    );
    setTemperature(Number((0.5 + random() * 1.3).toFixed(1)));
    setInterpolation(Number((0.15 + random() * 0.8).toFixed(2)));
    setMinLength(nextMinimum);
    setMaxLength(Math.min(20, nextMinimum + pick([3, 4, 5, 6, 7], random)));
    setCount(pick([6, 9, 12, 18, 30], random));
    setSeed("");
  }

  return (
    <div className="site-shell places-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Atelier des mots, accueil">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Atelier des mots</span>
        </Link>
        <nav aria-label="Navigation principale">
          <Link href="/">Générateur</Link>
          <Link className="is-active" href="/lieux">Lieux</Link>
          <Link href="/analyse">Analyse</Link>
        </nav>
        <span className="lab-badge" aria-label="Corpus français">FR</span>
      </header>

      <main>
        <section className="places-hero" aria-labelledby="places-title">
          <div>
            <p className="eyebrow">Toponymie française</p>
            <h1 id="places-title">Dessinez une carte, un nom à la fois.</h1>
            <p>
              Créez des noms de villes, de cours d’eau et de montagnes à partir
              de 8&nbsp;389 lieux de France.
            </p>
          </div>
          <button className="places-randomize" type="button" onClick={randomize}>
            <span aria-hidden="true">⚄</span>
            Tout régler au hasard
          </button>
        </section>

        <section className="places-layout" aria-label="Générateur de noms de lieux">
          <aside className="places-controls">
            <div className="places-control-section">
              <div className="places-section-heading">
                <span className="section-index">01 · Source</span>
                <strong>{corpusSize.toLocaleString("fr-FR")} sources</strong>
              </div>
              <label className="places-field places-language">
                <span>Langue</span>
                <select
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as PlaceLanguage)
                  }
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small>
                  {
                    LANGUAGE_OPTIONS.find((option) => option.id === language)
                      ?.detail
                  }
                </small>
              </label>
              <span className="places-label">Nature du lieu</span>
              <div className="place-type-grid" role="radiogroup" aria-label="Type de lieu">
                {TYPE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={type === option.id}
                    className={type === option.id ? "is-active" : ""}
                    onClick={() => setType(option.id)}
                    key={option.id}
                  >
                    <span>{option.index}</span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="places-control-section places-model-settings">
              <span className="section-index">02 · Paramètres de génération</span>
              <span className="field-label">Algorithme</span>
              <div className="segmented" role="group" aria-label="Algorithme">
                <button
                  type="button"
                  className={algorithm === "markov" ? "active" : ""}
                  onClick={() => setAlgorithm("markov")}
                  aria-pressed={algorithm === "markov"}
                >
                  Markov
                </button>
                <button
                  type="button"
                  className={algorithm === "interpolated" ? "active" : ""}
                  onClick={() => setAlgorithm("interpolated")}
                  aria-pressed={algorithm === "interpolated"}
                >
                  Markov interpolé
                </button>
                <button
                  type="button"
                  className={algorithm === "syllabic" ? "active" : ""}
                  onClick={() => setAlgorithm("syllabic")}
                  aria-pressed={algorithm === "syllabic"}
                >
                  Syllabique
                </button>
                <button
                  type="button"
                  className={algorithm === "phonetic" ? "active" : ""}
                  onClick={() => {
                    setAlgorithm("phonetic");
                    setOrder((current) => Math.min(current, 3));
                  }}
                  aria-pressed={algorithm === "phonetic"}
                >
                  Phonétique
                </button>
              </div>

              <div className={algorithm === "syllabic" ? "muted-control" : ""}>
                <div className="label-row">
                  <label htmlFor="places-order">
                    {algorithm === "phonetic"
                      ? "Contexte phonétique"
                      : "Contexte"}
                  </label>
                  <output htmlFor="places-order">
                    {order} {algorithm === "phonetic" ? "son" : "lettre"}
                    {order > 1 ? "s" : ""}
                  </output>
                </div>
                <input
                  id="places-order"
                  type="range"
                  min="1"
                  max={algorithm === "phonetic" ? "3" : "5"}
                  step="1"
                  value={order}
                  disabled={algorithm === "syllabic"}
                  onChange={(event) => setOrder(Number(event.target.value))}
                />
                <p className="field-help">
                  {algorithm === "phonetic"
                    ? "Nombre de groupes sonores précédents utilisés pour choisir le suivant."
                    : algorithm === "syllabic"
                      ? "L’algorithme syllabique alterne directement voyelles et consonnes ; le contexte ne s’applique pas."
                      : algorithm === "interpolated"
                        ? "Nombre maximal de lettres précédentes prises en compte ; les contextes plus courts restent utilisés en secours."
                        : "Nombre exact de lettres précédentes utilisées pour choisir la suivante."}
                </p>
              </div>

              {algorithm === "interpolated" && (
                <>
                  <div className="label-row">
                    <label htmlFor="places-interpolation">
                      Fidélité au contexte long
                    </label>
                    <output htmlFor="places-interpolation">
                      {Math.round(interpolation * 100)}%
                    </output>
                  </div>
                  <input
                    id="places-interpolation"
                    type="range"
                    min="0.15"
                    max="0.95"
                    step="0.05"
                    value={interpolation}
                    onChange={(event) =>
                      setInterpolation(Number(event.target.value))
                    }
                  />
                  <p className="field-help">
                    Haut : reproduit davantage les longs enchaînements du
                    corpus. Bas : mélange davantage les contextes courts.
                  </p>
                </>
              )}

              <div className="label-row">
                <label htmlFor="places-temperature">Créativité</label>
                <output htmlFor="places-temperature">
                  {temperature.toFixed(1)}
                </output>
              </div>
              <input
                id="places-temperature"
                type="range"
                min="0.5"
                max="1.8"
                step="0.1"
                value={temperature}
                onChange={(event) =>
                  setTemperature(Number(event.target.value))
                }
              />
              <p className="field-help">
                Bas : favorise les enchaînements les plus fréquents du corpus.
                Haut : augmente la probabilité des combinaisons rares.
              </p>

              <span className="places-label">Forme du nom</span>
              <div className="places-segmented" role="group" aria-label="Forme du nom">
                {STRUCTURE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    className={structure === option.id ? "is-active" : ""}
                    onClick={() => setStructure(option.id)}
                    aria-pressed={structure === option.id}
                    key={option.id}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="field-help">{selectedStructure.help}</p>
            </div>

            <div className="places-control-section">
              <span className="section-index">03 · Série</span>
              <div className="length-grid">
                <label>
                  Longueur min.
                  <input
                    type="number"
                    min="2"
                    max={maxLength}
                    value={minLength}
                    onChange={(event) =>
                      setMinLength(Math.max(2, Number(event.target.value)))
                    }
                  />
                </label>
                <label>
                  Longueur max.
                  <input
                    type="number"
                    min={minLength}
                    max="20"
                    value={maxLength}
                    onChange={(event) =>
                      setMaxLength(
                        Math.max(
                          minLength,
                          Math.min(20, Number(event.target.value)),
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <div className="label-row">
                <label htmlFor="places-count">Nombre de noms</label>
                <output htmlFor="places-count">{count}</output>
              </div>
              <input
                id="places-count"
                type="range"
                min="3"
                max="300"
                step="3"
                value={count}
                onChange={(event) =>
                  setCount(normalizeGenerationCount(Number(event.target.value)))
                }
              />
              <div className="seed-field">
                <label htmlFor="places-seed">Graine reproductible</label>
                <div>
                  <input
                    id="places-seed"
                    type="text"
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                    placeholder="Vide = nouvelle graine aléatoire"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setSeed(createSeed())}
                    aria-label="Créer une nouvelle graine"
                  >
                    ↻
                  </button>
                </div>
                <p className="field-help">
                  Laissez vide pour une nouvelle série aléatoire à chaque
                  génération. Saisissez une graine pour reproduire une série.
                </p>
                {lastSeed && (
                  <div className="used-seed" aria-live="polite">
                    <span>
                      <small>Graine utilisée</small>
                      <code>{lastSeed}</code>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSeed(lastSeed)}
                      title="Réutiliser cette graine"
                    >
                      Réutiliser
                    </button>
                    <button
                      type="button"
                      onClick={copyLastSeed}
                      title="Copier cette graine"
                    >
                      {seedCopied ? "Copiée ✓" : "Copier"}
                    </button>
                  </div>
                )}
              </div>
              <button className="generate-button" type="button" onClick={generate}>
                <span>Générer les lieux</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </aside>

          <div className="places-results">
            <div className="places-results-heading">
              <div>
                <p className="section-index">Carte en cours</p>
                <h2>{selectedType.label}</h2>
              </div>
              <div>
                <span>{results.length} propositions</span>
                {lastSeed && <code title={lastSeed}>{lastSeed}</code>}
              </div>
            </div>
            <div className="place-name-grid" aria-live="polite">
              {results.map((name, index) => (
                <button
                  type="button"
                  className={copiedName === name ? "is-copied" : ""}
                  onClick={() => copyName(name)}
                  style={{ animationDelay: `${index * 35}ms` }}
                  key={`${name}-${index}`}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{name}</strong>
                  <small>{copiedName === name ? "Copié" : "Copier"}</small>
                </button>
              ))}
            </div>
            <div className="places-note">
              <span aria-hidden="true">⌁</span>
              <p>
                Les propositions sont inédites. Leur rythme est appris sur des
                communes, villages, rivières, fleuves et reliefs situés en
                France, puis recomposé selon vos réglages.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>Corpus français · génération locale dans votre navigateur.</span>
        <span>
          Sources&nbsp;:{" "}
          <a href="https://github.com/datagouv/decoupage-administratif">
            INSEE / Etalab
          </a>
          {" · "}
          <a href="https://www.geonames.org/">GeoNames</a>
          {" · "}
          <a href="https://fr.wikipedia.org/wiki/Liste_de_fleuves_de_France">
            Wikipédia
          </a>
        </span>
      </footer>
    </div>
  );
}
