"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import placeDictionaryData from "../data/place-dictionaries.json";
import {
  GeneratorConfig,
  WeightedSource,
  generateBatch,
  prepareModel,
} from "../generator";

type PlaceType = "settlement" | "water" | "mountain";
type PlaceStyle = "natural" | "heritage" | "legendary";
type PlaceStructure = "simple" | "compound" | "territorial";
type PlaceSound = "soft" | "balanced" | "rugged";
type PlaceLength = "short" | "medium" | "long";

type Dictionary = {
  id: string;
  name: string;
  words: string[];
};

const PLACE_DICTIONARIES = placeDictionaryData as Dictionary[];

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

const STYLE_OPTIONS: { id: PlaceStyle; label: string; help: string }[] = [
  { id: "natural", label: "Naturel", help: "Sobre et crédible" },
  { id: "heritage", label: "Patrimonial", help: "Ancien et régional" },
  { id: "legendary", label: "Légendaire", help: "Évocateur, sans quitter le français" },
];

const STRUCTURE_OPTIONS: { id: PlaceStructure; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "compound", label: "Composé" },
  { id: "territorial", label: "Territorial" },
];

const SOUND_OPTIONS: { id: PlaceSound; label: string }[] = [
  { id: "soft", label: "Douce" },
  { id: "balanced", label: "Équilibrée" },
  { id: "rugged", label: "Rocailleuse" },
];

const LENGTHS: Record<PlaceLength, { min: number; max: number; label: string }> = {
  short: { min: 4, max: 7, label: "Court" },
  medium: { min: 6, max: 11, label: "Moyen" },
  long: { min: 9, max: 15, label: "Long" },
};

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

function sourcesFor(type: PlaceType, style: PlaceStyle) {
  if (type === "settlement") {
    return style === "heritage"
      ? [
          dictionary("fr-lieux-villages", 1.5),
          dictionary("fr-lieux-villes", 0.6),
        ]
      : [
          dictionary("fr-lieux-villes", style === "legendary" ? 0.8 : 1.2),
          dictionary("fr-lieux-villages", 1),
        ];
  }
  if (type === "water") {
    return [
      dictionary("fr-lieux-rivieres", style === "natural" ? 1.3 : 1),
      dictionary("fr-lieux-fleuves", style === "heritage" ? 1.2 : 0.8),
    ];
  }
  return [dictionary("fr-lieux-montagnes")];
}

function formatPlaceName(
  core: string,
  companion: string,
  type: PlaceType,
  style: PlaceStyle,
  structure: PlaceStructure,
  random: () => number,
) {
  const first = titleCase(core);
  const second = titleCase(companion);

  if (structure === "simple") return first;

  if (type === "settlement") {
    if (structure === "compound") {
      const prefixes =
        style === "legendary"
          ? ["Belle", "Clair", "Haut", "Roche", "Val"]
          : style === "heritage"
            ? ["Saint", "Sainte", "Mont", "Château", "Villiers"]
            : ["Bel", "Val", "Mont", "Bois", "Font"];
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
      const forms =
        style === "heritage"
          ? ["Gave de", "Bief de", "Rivière de", "Ruisseau de"]
          : style === "legendary"
            ? ["Eaux de", "Torrent de", "Grande", "Sombre"]
            : ["Rivière de", "Ruisseau de", "Bras de", "Cours de"];
      return `${pick(forms, random)} ${first}`;
    }
    return `${first} de ${second}`;
  }

  if (structure === "compound") {
    const forms =
      style === "legendary"
        ? ["Dent de", "Aiguille de", "Roc de", "Cime de"]
        : style === "heritage"
          ? ["Mont", "Puy", "Pic de", "Pointe de"]
          : ["Mont", "Pic de", "Sommet de", "Crêt de"];
    return `${pick(forms, random)} ${first}`;
  }
  return `${first}-${second}`;
}

function buildNames({
  type,
  style,
  structure,
  sound,
  length,
  count,
  seed,
}: {
  type: PlaceType;
  style: PlaceStyle;
  structure: PlaceStructure;
  sound: PlaceSound;
  length: PlaceLength;
  count: number;
  seed: string;
}) {
  const lengthRange = LENGTHS[length];
  const temperature =
    sound === "soft" ? 0.72 : sound === "rugged" ? 1.12 : 0.9;
  const order = sound === "rugged" ? 2 : 3;
  const config: GeneratorConfig = {
    algorithm: sound === "soft" ? "phonetic" : "interpolated",
    order,
    temperature,
    interpolation: style === "natural" ? 0.78 : 0.62,
    minLength: lengthRange.min,
    maxLength: lengthRange.max,
    count: Math.max(36, count * 4),
    seed,
    constraints: {
      startsWith: "",
      endsWith: "",
      includes: "",
      excludes: "",
      allowDictionaryWords: false,
    },
  };
  const model = prepareModel(sourcesFor(type, style), config);
  const cores = generateBatch(model, config);
  const random = seededRandom(`${seed}:${type}:${style}:${structure}:${sound}`);
  const names = new Set<string>();

  for (let index = 0; index < cores.length && names.size < count; index += 1) {
    const companion = cores[(index + 5) % cores.length] ?? cores[0];
    names.add(
      formatPlaceName(
        cores[index],
        companion,
        type,
        style,
        structure,
        random,
      ),
    );
  }
  return Array.from(names);
}

export default function PlacesPage() {
  const [type, setType] = useState<PlaceType>("settlement");
  const [style, setStyle] = useState<PlaceStyle>("natural");
  const [structure, setStructure] = useState<PlaceStructure>("simple");
  const [sound, setSound] = useState<PlaceSound>("balanced");
  const [length, setLength] = useState<PlaceLength>("medium");
  const [count, setCount] = useState(9);
  const [seed, setSeed] = useState("");
  const [lastSeed, setLastSeed] = useState("");
  const [results, setResults] = useState(INITIAL_RESULTS);
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const selectedType = useMemo(
    () => TYPE_OPTIONS.find((option) => option.id === type) ?? TYPE_OPTIONS[0],
    [type],
  );
  const corpusSize = useMemo(
    () =>
      sourcesFor(type, style).reduce(
        (total, source) => total + source.words.length,
        0,
      ),
    [type, style],
  );

  function generate() {
    const resolvedSeed = seed.trim() || createSeed();
    setLastSeed(resolvedSeed);
    setResults(
      buildNames({
        type,
        style,
        structure,
        sound,
        length,
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

  function randomize() {
    const random = seededRandom(createSeed());
    setType(pick(TYPE_OPTIONS, random).id);
    setStyle(pick(STYLE_OPTIONS, random).id);
    setStructure(pick(STRUCTURE_OPTIONS, random).id);
    setSound(pick(SOUND_OPTIONS, random).id);
    setLength(pick(Object.keys(LENGTHS) as PlaceLength[], random));
    setCount(pick([6, 9, 12], random));
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
                <span className="section-index">01 · Nature du lieu</span>
                <strong>{corpusSize.toLocaleString("fr-FR")} sources</strong>
              </div>
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

            <div className="places-control-section places-settings">
              <span className="section-index">02 · Caractère</span>
              <label className="places-field">
                <span>Style</span>
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value as PlaceStyle)}
                >
                  {STYLE_OPTIONS.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label} — {option.help}
                    </option>
                  ))}
                </select>
              </label>
              <span className="places-label">Structure</span>
              <div className="places-segmented" role="group" aria-label="Structure">
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
              <span className="places-label">Sonorité</span>
              <div className="places-segmented" role="group" aria-label="Sonorité">
                {SOUND_OPTIONS.map((option) => (
                  <button
                    type="button"
                    className={sound === option.id ? "is-active" : ""}
                    onClick={() => setSound(option.id)}
                    aria-pressed={sound === option.id}
                    key={option.id}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="places-control-section">
              <span className="section-index">03 · Série</span>
              <div className="places-series-grid">
                <label className="places-field">
                  <span>Longueur</span>
                  <select
                    value={length}
                    onChange={(event) =>
                      setLength(event.target.value as PlaceLength)
                    }
                  >
                    {Object.entries(LENGTHS).map(([id, option]) => (
                      <option value={id} key={id}>
                        {option.label} · {option.min}–{option.max} lettres
                      </option>
                    ))}
                  </select>
                </label>
                <label className="places-field">
                  <span>Quantité</span>
                  <select
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value))}
                  >
                    <option value="6">6 noms</option>
                    <option value="9">9 noms</option>
                    <option value="12">12 noms</option>
                  </select>
                </label>
              </div>
              <label className="places-field places-seed">
                <span>Graine facultative</span>
                <div>
                  <input
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                    placeholder="Une carte reproductible"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setSeed(createSeed())}
                    aria-label="Créer une nouvelle graine"
                  >
                    ↻
                  </button>
                </div>
              </label>
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
