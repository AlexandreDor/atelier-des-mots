export const LICENSE_REVIEWED_AT = "2026-08-01";

const imported = (date) => `Export amont non consigné · import du ${date}`;

export const SUSPENDED_DATASETS = [
  "fr-nature-animaux",
  "fr-nature-plantes",
  "fr-nature-champignons",
];

export const DATASET_METADATA = {
  "fr-mots": {
    source: "Wiktionary · listes de fréquence françaises",
    sourceUrl:
      "https://en.wiktionary.org/wiki/Wiktionary:French_frequency_lists/1-2000",
    intermediary: "most-common-words-by-language",
    intermediaryUrl:
      "https://github.com/oprogramador/most-common-words-by-language",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Contributeurs de Wiktionary",
    sourceVersion: imported("2026-07-28"),
    accessedAt: "2026-07-28",
    transformations:
      "Agrégation des listes, normalisation Unicode, suppression de ponctuation et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "de-mots": {
    source: "Wiktionary · listes de fréquence allemandes de Matthias Buchmeier",
    sourceUrl:
      "https://en.wiktionary.org/wiki/User:Matthias_Buchmeier/German_frequency_list-1-5000",
    intermediary: "most-common-words-by-language",
    intermediaryUrl:
      "https://github.com/oprogramador/most-common-words-by-language",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Matthias Buchmeier et contributeurs de Wiktionary",
    sourceVersion: imported("2026-07-28"),
    accessedAt: "2026-07-28",
    transformations:
      "Agrégation des listes, normalisation Unicode, suppression de ponctuation et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "es-mots": {
    source: "Wiktionary · listes de fréquence espagnoles de Matthias Buchmeier",
    sourceUrl:
      "https://en.wiktionary.org/wiki/User:Matthias_Buchmeier/Spanish_frequency_list-1-5000",
    intermediary: "most-common-words-by-language",
    intermediaryUrl:
      "https://github.com/oprogramador/most-common-words-by-language",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Matthias Buchmeier et contributeurs de Wiktionary",
    sourceVersion: imported("2026-07-28"),
    accessedAt: "2026-07-28",
    transformations:
      "Agrégation des listes, normalisation Unicode, suppression de ponctuation et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "en-mots": {
    source: "Google 10,000 English · first20hours",
    sourceUrl: "https://github.com/first20hours/google-10000-english",
    license: "LicenseRef-Google-10000-English",
    licenseUrl:
      "https://github.com/first20hours/google-10000-english/blob/master/LICENSE.md",
    attribution:
      "Google Web Trillion Word Corpus, Peter Norvig et Josh Kaufman",
    sourceVersion: imported("2026-07-28"),
    accessedAt: "2026-07-28",
    transformations:
      "Sélection, normalisation Unicode, suppression de ponctuation et dédoublonnage.",
    usageRestriction:
      "Conservé pour un usage personnel et non commercial. La licence amont ne couvre pas clairement la redistribution commerciale.",
  },
  "it-mots": {
    source: "FrequencyWords · OpenSubtitles · italien",
    sourceUrl:
      "https://github.com/hermitdave/FrequencyWords/blob/master/content/2016/it/it_full.txt",
    intermediary: "most-common-words-by-language",
    intermediaryUrl:
      "https://github.com/oprogramador/most-common-words-by-language",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Hermit Dave et contributeurs d’OpenSubtitles",
    sourceVersion: "FrequencyWords · content/2016",
    accessedAt: "2026-07-28",
    transformations:
      "Sélection des 10 000 premiers termes, normalisation Unicode et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "ja-mots-romaji": {
    source: "FrequencyWords · OpenSubtitles · japonais",
    sourceUrl:
      "https://github.com/hermitdave/FrequencyWords/blob/master/content/2016/ja/ja_50k.txt",
    intermediary: "most-common-words-by-language",
    intermediaryUrl:
      "https://github.com/oprogramador/most-common-words-by-language",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Hermit Dave et contributeurs d’OpenSubtitles",
    sourceVersion: "FrequencyWords · content/2016",
    accessedAt: "2026-07-28",
    transformations:
      "Sélection, romanisation avec Kuroshiro (MIT), normalisation Unicode et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "ru-mots-cyrillique": {
    source: "FrequencyWords · OpenSubtitles · russe",
    sourceUrl:
      "https://github.com/hermitdave/FrequencyWords/blob/master/content/2016/ru/ru_50k.txt",
    intermediary: "most-common-words-by-language",
    intermediaryUrl:
      "https://github.com/oprogramador/most-common-words-by-language",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Hermit Dave et contributeurs d’OpenSubtitles",
    sourceVersion: "FrequencyWords · content/2016",
    accessedAt: "2026-07-28",
    transformations:
      "Sélection des 10 000 premiers termes, normalisation Unicode et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "ru-mots-romanise": {
    source: "FrequencyWords · OpenSubtitles · russe",
    sourceUrl:
      "https://github.com/hermitdave/FrequencyWords/blob/master/content/2016/ru/ru_50k.txt",
    intermediary: "most-common-words-by-language",
    intermediaryUrl:
      "https://github.com/oprogramador/most-common-words-by-language",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Hermit Dave et contributeurs d’OpenSubtitles",
    sourceVersion: "FrequencyWords · content/2016",
    accessedAt: "2026-07-28",
    transformations:
      "Sélection, romanisation, normalisation Unicode et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "fr-prenoms": fakerMetadata("français"),
  "en-prenoms": fakerMetadata("anglais"),
  "de-prenoms": fakerMetadata("allemands"),
  "ja-prenoms-romaji": fakerMetadata("japonais", "Romanisation avec Kuroshiro (MIT), "),
  "it-prenoms": fakerMetadata("italiens"),
  "es-prenoms": fakerMetadata("espagnols"),
  "ru-prenoms-cyrillique": fakerMetadata("russes"),
  "ru-prenoms-romanise": fakerMetadata("russes", "Romanisation, "),
  "en-rues-routes": {
    source: "Wikimedia Commons · Streets in London by name",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/Category:Streets_in_London_by_name",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Contributeurs de Wikimedia Commons",
    sourceVersion: "Catégories alphabétiques · import du 2026-08-01",
    accessedAt: "2026-08-01",
    transformations:
      "Extraction d’au plus 200 titres par catégorie alphabétique, suppression des précisions géographiques, normalisation Unicode et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "ru-rues-routes-romanise": {
    source: "Wikimedia Commons · Streets in Moscow by name",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/Category:Streets_in_Moscow_by_name",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Contributeurs de Wikimedia Commons",
    sourceVersion: imported("2026-07-28"),
    accessedAt: "2026-07-28",
    transformations:
      "Extraction des titres, romanisation, normalisation Unicode et dédoublonnage.",
    derivedDataLicense: "CC-BY-SA-4.0",
  },
  "fr-lieux-villes": communeMetadata(
    "Communes métropolitaines d’au moins 2 000 habitants, classées par population puis limitées à 2 500 noms.",
  ),
  "fr-lieux-villages": communeMetadata(
    "Communes métropolitaines de moins de 2 000 habitants, échantillon déterministe de 4 000 noms.",
  ),
  "fr-lieux-rivieres": geonamesMetadata(
    "Filtrage des entités hydrographiques françaises, échantillon déterministe de 1 000 noms.",
  ),
  "fr-lieux-montagnes": geonamesMetadata(
    "Filtrage des reliefs français, échantillon déterministe de 689 noms.",
  ),
  "ru-lieux-localites-romanise": {
    source: "GeoNames · export RU.txt",
    sourceUrl: "https://download.geonames.org/export/dump/RU.zip",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "GeoNames",
    sourceVersion: "Export quotidien récupéré le 2026-08-09",
    accessedAt: "2026-08-09",
    licenseReviewedAt: "2026-08-09",
    transformations:
      "Filtrage des localités habitées, sélection des 5 000 plus peuplées, utilisation du nom ASCII romanisé, normalisation et dédoublonnage.",
  },
  "fr-lieux-fleuves": wikipediaMetadata(
    "Liste de fleuves de France",
    "https://fr.wikipedia.org/wiki/Liste_de_fleuves_de_France",
    "Extraction du premier tableau, nettoyage des annotations et sélection de 200 noms.",
  ),
  "fr-nature-mineraux": wikipediaMetadata(
    "Liste de minéraux",
    "https://fr.wikipedia.org/wiki/Liste_de_min%C3%A9raux",
    "Agrégation des pages alphabétiques, nettoyage des annotations et dédoublonnage.",
  ),
};

function fakerMetadata(locale, prefix = "") {
  return {
    source: `@faker-js/faker · prénoms ${locale}`,
    sourceUrl: "https://github.com/faker-js/faker",
    license: "MIT",
    licenseUrl: "https://github.com/faker-js/faker/blob/next/LICENSE",
    attribution: "Faker contributors, Marak Squires et auteurs amont cités",
    sourceVersion: imported("2026-07-28"),
    accessedAt: "2026-07-28",
    transformations: `${prefix}normalisation Unicode et dédoublonnage.`,
  };
}

function communeMetadata(transformations) {
  return {
    source: "Découpage administratif · Etalab / INSEE",
    sourceUrl: "https://github.com/datagouv/decoupage-administratif",
    license: "etalab-2.0",
    licenseUrl: "https://www.data.gouv.fr/pages/legal/licences/etalab-2.0",
    attribution: "Etalab / INSEE",
    sourceVersion: imported("2026-07-29"),
    accessedAt: "2026-07-29",
    transformations,
  };
}

function geonamesMetadata(transformations) {
  return {
    source: "GeoNames · export FR.txt",
    sourceUrl: "https://download.geonames.org/export/dump/FR.zip",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "GeoNames",
    sourceVersion: "Export quotidien récupéré le 2026-07-29",
    accessedAt: "2026-07-29",
    transformations,
  };
}

function wikipediaMetadata(title, sourceUrl, transformations) {
  return {
    source: `Wikipédia en français · ${title}`,
    sourceUrl,
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Contributeurs de Wikipédia en français",
    sourceVersion: imported("2026-07-29"),
    accessedAt: "2026-07-29",
    transformations,
    derivedDataLicense: "CC-BY-SA-4.0",
  };
}

for (const metadata of Object.values(DATASET_METADATA)) {
  metadata.licenseReviewedAt ??= LICENSE_REVIEWED_AT;
}
