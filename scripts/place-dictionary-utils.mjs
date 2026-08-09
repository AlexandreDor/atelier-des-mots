import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export const POPULATED_PLACE_CODES = new Set([
  "PPL",
  "PPLA",
  "PPLA2",
  "PPLA3",
  "PPLA4",
  "PPLC",
  "PPLG",
]);

export const ROAD_HIGHWAY_TYPES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "road",
  "pedestrian",
  "track",
]);

const LINKERS = [
  "de la",
  "de l'",
  "de l’",
  "de los",
  "de las",
  "d'",
  "d’",
  "della",
  "dels",
  "du",
  "des",
  "del",
  "dos",
  "das",
  "de",
  "di",
  "do",
  "da",
  "à",
  "á",
  "a",
  "au",
  "aux",
  "en",
  "sur",
  "sous",
];

const ARTICLES = [
  "la",
  "le",
  "les",
  "el",
  "los",
  "las",
  "a",
  "o",
  "os",
  "as",
  "l'",
  "l’",
];

const GENERIC_TERMS = {
  forest: ["forêts", "forêt", "bois"],
  mountain: [
    "aiguilles",
    "aiguille",
    "ballon",
    "buttes",
    "butte",
    "capu",
    "capo",
    "cap",
    "cimes",
    "cime",
    "côte",
    "dents",
    "dent",
    "montagnes",
    "montagne",
    "monts",
    "mont",
    "mornes",
    "morne",
    "pics",
    "pic",
    "pico",
    "pointes",
    "pointe",
    "puig",
    "punta",
    "puy",
    "rochers",
    "rocher",
    "rocs",
    "roc",
    "serre",
    "signal",
    "sommets",
    "sommet",
    "têtes",
    "tête",
  ],
  beach: ["plages", "plage", "playas", "playa", "platja", "beach"],
  "road-hu": [
    "autópálya",
    "országút",
    "sugárút",
    "lakópark",
    "kisvasút",
    "vasút",
    "alagút",
    "straße",
    "strasse",
    "utcája",
    "útja",
    "körút",
    "sétány",
    "rakpart",
    "lépcső",
    "autóút",
    "fasor",
    "dűlő",
    "dűlője",
    "dűlők",
    "lejtő",
    "utca",
    "út",
    "tér",
    "tere",
    "köz",
    "köze",
    "sor",
    "park",
    "híd",
  ],
  "road-es": [
    "paseo marítimo",
    "travessera",
    "callejón",
    "autovía",
    "autopista",
    "avenida",
    "carretera",
    "camino",
    "paseo",
    "plazoleta",
    "travesía",
    "glorieta",
    "rambla",
    "ronda",
    "pasaje",
    "bulevar",
    "carrer",
    "carreró",
    "carrerón",
    "avinguda",
    "passeig",
    "plaça",
    "camí",
    "rúa",
    "estrada",
    "camiño",
    "praza",
    "kalea",
    "etorbidea",
    "errepidea",
    "bidea",
    "bide",
    "pasealekua",
    "zumardia",
    "calle",
    "plaza",
    "vía",
    "avda",
    "avd",
    "av",
  ],
};

const FOREST_QUALIFIERS = [
  "domaniale",
  "domanial",
  "communale",
  "communal",
  "territoriale",
  "territorial",
  "nationale",
  "national",
  "départementale",
  "départemental",
  "régionale",
  "régional",
];

const GENERIC_ONLY_NAMES = Object.fromEntries(
  Object.entries(GENERIC_TERMS).map(([kind, terms]) => {
    const extras = kind === "forest" ? FOREST_QUALIFIERS : [];
    const values = [
      ...terms,
      ...extras,
      ...ARTICLES,
      ...LINKERS,
      ...terms.flatMap((term) =>
        extras.flatMap((extra) => [`${term} ${extra}`, `${extra} ${term}`]),
      ),
    ];
    return [
      kind,
      new Set(values.map((value) => value.toLocaleLowerCase("fr-FR"))),
    ];
  }),
);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternatives(values) {
  return [...values]
    .sort((first, second) => second.length - first.length)
    .map(escapeRegex)
    .join("|");
}

const LINKER_PATTERN = alternatives(LINKERS);
const ARTICLE_PATTERN = alternatives(ARTICLES);
const FOREST_QUALIFIER_PATTERN = alternatives(FOREST_QUALIFIERS);

function cleanRawName(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\[[^\]]*\]|\([^)]*\)/gu, " ")
    .replace(/^[\s“”"«»'’.,:;!?/\\|_=+*~`-]+|[\s“”"«»'’.,:;!?/\\|_=+*~`-]+$/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/\s*-\s*/gu, "-")
    .trim();
}

function normalizeRoadAbbreviation(value) {
  return value
    .replace(/^c\s*\/\s*/iu, "calle ")
    .replace(/^(?:av|avda)\.?\s+/iu, "avenida ");
}

function stripGenericBoundary(value, terms, { qualifiers = false } = {}) {
  const termPattern = alternatives(terms);
  const qualifierPattern = qualifiers ? FOREST_QUALIFIER_PATTERN : "(?!)";
  const precedingTypePattern = `(?:(?:${LINKER_PATTERN}|${ARTICLE_PATTERN})\\s+)?`;
  let result = value;
  let changed = false;

  const leading = new RegExp(
    `^(?:(?:${ARTICLE_PATTERN})\\s+)?(?:${termPattern})(?:\\s+(?:${qualifierPattern}))?(?:(?:\\s+(?:${LINKER_PATTERN})(?=\\s|\\p{L}|$)\\s*)|[-\\s]+)`,
    "iu",
  );
  const trailing = new RegExp(
    `(?:[\\s-]+)${precedingTypePattern}(?:${termPattern})(?:\\s+(?:${qualifierPattern}))?$`,
    "iu",
  );

  const next = result.replace(leading, "").replace(trailing, "");
  if (next !== result) changed = true;
  result = next.trim();
  return { value: result, changed };
}

function stripRoadBoundary(value, language) {
  let result = language === "es" ? normalizeRoadAbbreviation(value) : value;
  let changed = false;
  const terms = GENERIC_TERMS[`road-${language}`];

  for (let pass = 0; pass < 8; pass += 1) {
    const before = result;
    const stripped = stripGenericBoundary(result, terms);
    result = stripped.value;
    changed ||= stripped.changed;
    if (result === before) break;
  }

  if (language === "hu") {
    const compoundTerms = [
      "lakópark",
      "autópálya",
      "országút",
      "sugárút",
      "körút",
      "kisvasút",
      "vasút",
      "alagút",
      "utcája",
      "útja",
      "utca",
      "út",
      "tér",
      "tere",
      "köz",
      "köze",
      "sétány",
      "fasor",
      "rakpart",
      "dűlő",
      "dűlője",
      "dűlők",
      "lejtő",
      "lépcső",
      "park",
      "straße",
      "strasse",
    ].sort((first, second) => second.length - first.length);
    for (const suffix of compoundTerms) {
      const compound = new RegExp(
        `(\\p{L}{2,})${escapeRegex(suffix)}(?=$|[\\s-])`,
        "giu",
      );
      const next = result.replace(compound, "$1");
      if (next !== result) changed = true;
      result = next;
    }
    for (let pass = 0; pass < 8; pass += 1) {
      const before = result;
      result = stripGenericBoundary(result, terms).value;
      result = result.replace(/\s+/gu, " ").trim();
      if (result === before) break;
    }
  }

  return { value: result, changed };
}

function hasForbiddenNameShape(value) {
  return (
    !value ||
    value.length < 2 ||
    /\d/u.test(value) ||
    /[;=<>[\]{}|/]/u.test(value) ||
    !/^\p{L}/u.test(value) ||
    !/\p{L}$/u.test(value) ||
    !/^\p{L}[\p{L} \u2019'\-]*\p{L}$/u.test(value)
  );
}

function isGenericOnlyName(value, kind) {
  return GENERIC_ONLY_NAMES[kind]?.has(value.toLocaleLowerCase("fr-FR")) ?? false;
}

export function cleanFeatureName(raw, kind) {
  let value = cleanRawName(raw);
  if (isGenericOnlyName(value, kind)) return null;
  if (kind === "road-es" || kind === "road-hu") {
    value = stripRoadBoundary(value, kind === "road-es" ? "es" : "hu").value;
  } else {
    const terms = GENERIC_TERMS[kind];
    if (!terms) throw new Error(`Type de nettoyage inconnu : ${kind}`);
    for (let pass = 0; pass < 8; pass += 1) {
      const before = value;
      const stripped = stripGenericBoundary(value, terms, {
        qualifiers: kind === "forest",
      });
      value = stripped.value;
      if (value === before) break;
    }
  }
  value = cleanRawName(value);
  if (isGenericOnlyName(value, kind)) return null;
  return hasForbiddenNameShape(value) ? null : value;
}

export function normalizePlainName(raw) {
  const value = cleanRawName(raw);
  return hasForbiddenNameShape(value) ? null : value;
}

export function collectNormalizedNames(values, locale = "fr") {
  const seen = new Set();
  const names = [];
  let transformed = 0;
  let rejected = 0;
  let duplicates = 0;

  for (const raw of values) {
    const normalized = normalizePlainName(raw);
    const comparable =
      typeof raw === "string"
        ? raw.normalize("NFC").replace(/\s+/gu, " ").trim()
        : "";
    if (normalized && normalized !== comparable) transformed += 1;
    if (!normalized) {
      rejected += 1;
      continue;
    }
    const key = normalized.toLocaleLowerCase(locale);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    names.push(normalized);
  }

  return {
    names,
    stats: {
      candidates: values.length,
      transformed,
      rejected,
      duplicates,
    },
  };
}

export function collectCleanNames(values, kind, locale = "fr") {
  const seen = new Set();
  const names = [];
  let transformed = 0;
  let rejected = 0;
  let duplicates = 0;

  for (const raw of values) {
    const name = cleanFeatureName(raw, kind);
    if (name && name !== cleanRawName(raw)) transformed += 1;
    if (!name) {
      rejected += 1;
      continue;
    }
    const key = name.toLocaleLowerCase(locale);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    names.push(name);
  }

  return {
    names,
    stats: {
      candidates: values.length,
      transformed,
      rejected,
      duplicates,
    },
  };
}

export function uniqueNames(values, locale = "fr") {
  return collectNormalizedNames(values, locale).names;
}

export function stableRank(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicSample(values, count, locale = "fr") {
  return [...values]
    .sort(
      (first, second) =>
        stableRank(first) - stableRank(second) ||
        first.localeCompare(second, locale, { sensitivity: "base" }),
    )
    .slice(0, count)
    .sort((first, second) =>
      first.localeCompare(second, locale, { sensitivity: "base" }),
    );
}

export function parseGeoNames(tsv) {
  return tsv
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\t");
      return {
        id: fields[0],
        name: fields[1],
        asciiName: fields[2],
        featureClass: fields[6],
        featureCode: fields[7],
        countryCode: fields[8],
        admin1Code: fields[10],
        population: Number(fields[14] || 0),
      };
    });
}

export async function* readGeoJsonSequence(path) {
  const input = createReadStream(path, "utf8");
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const value = line.replace(/^\u001e/u, "").trim();
      if (!value) continue;
      try {
        yield JSON.parse(value);
      } catch {
        // An incomplete or non-feature line is ignored and reported by the
        // caller's candidate counts rather than aborting a large extraction.
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

export function roadNamesFromFeature(feature) {
  const properties = feature?.properties;
  if (!properties || typeof properties !== "object") return null;
  const highway = properties.highway;
  const name = properties.name;
  if (
    typeof highway !== "string" ||
    !ROAD_HIGHWAY_TYPES.has(highway) ||
    typeof name !== "string"
  ) {
    return null;
  }
  return name;
}
