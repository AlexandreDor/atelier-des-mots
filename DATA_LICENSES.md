# Sources et licences des corpus

Révision de cet inventaire : **9 août 2026**.

La licence MIT du fichier [`LICENSE`](LICENSE) couvre le code du projet. Elle
ne remplace pas les licences propres aux corpus de `app/data/`. Les corpus
dérivés de contenus CC BY-SA restent distribués sous **CC BY-SA 4.0** ; cette
obligation ne s’étend pas au code indépendant de l’application.

## Corpus actifs

| Corpus | Source et version | Licence | Transformations et attribution |
| --- | --- | --- | --- |
| `fr-mots` | Listes de fréquence françaises de Wiktionary, export amont non consigné, import du 28 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Agrégation via `most-common-words-by-language`, normalisation, filtrage et dédoublonnage. Attribution : contributeurs de Wiktionary. |
| `de-mots` | Listes allemandes de Matthias Buchmeier sur Wiktionary, export amont non consigné, import du 28 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Agrégation, normalisation, filtrage et dédoublonnage. Attribution : Matthias Buchmeier et contributeurs de Wiktionary. |
| `es-mots` | Listes espagnoles de Matthias Buchmeier sur Wiktionary, export amont non consigné, import du 28 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Agrégation, normalisation, filtrage et dédoublonnage. Attribution : Matthias Buchmeier et contributeurs de Wiktionary. |
| `it-mots` | [FrequencyWords](https://github.com/hermitdave/FrequencyWords), contenu OpenSubtitles `content/2016`, import du 28 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) pour le contenu | Sélection des 10 000 premiers termes, normalisation et dédoublonnage. Attribution : Hermit Dave et contributeurs d’OpenSubtitles. |
| `ja-mots-romaji` | FrequencyWords/OpenSubtitles `content/2016`, import du 28 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) pour le contenu | Sélection puis romanisation avec [Kuroshiro](https://github.com/hexenq/kuroshiro) (MIT), normalisation et dédoublonnage. |
| `ru-mots-cyrillique`, `ru-mots-romanise` | FrequencyWords/OpenSubtitles `content/2016`, import du 28 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) pour le contenu | Sélection, normalisation et dédoublonnage ; romanisation supplémentaire pour le second corpus. |
| `en-mots` | [Google 10,000 English](https://github.com/first20hours/google-10000-english), export amont non consigné, import du 28 juillet 2026 | [Licence amont spécifique](https://github.com/first20hours/google-10000-english/blob/master/LICENSE.md) | **Usage personnel et non commercial uniquement dans ce projet.** La licence amont ne couvre pas clairement une redistribution commerciale. Le contenu du corpus n’a pas été modifié lors de cette mise en conformité. |
| `fr-prenoms`, `en-prenoms`, `de-prenoms`, `it-prenoms`, `es-prenoms`, `ru-prenoms-cyrillique`, `ru-prenoms-romanise`, `ja-prenoms-romaji` | Données de [@faker-js/faker](https://github.com/faker-js/faker), version amont non consignée, import du 28 juillet 2026 | MIT | Normalisation et dédoublonnage ; romanisation des variantes concernées. Les avis complets sont conservés dans [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). |
| `en-rues-routes` | Titres des catégories alphabétiques de [Streets in London by name](https://commons.wikimedia.org/wiki/Category:Streets_in_London_by_name), import du 1er août 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Extraction d’au plus 200 titres par catégorie alphabétique, retrait des précisions géographiques, normalisation et dédoublonnage. Attribution : contributeurs de Wikimedia Commons et historiques des pages liées. |
| `ru-rues-routes-romanise` | Titres de la catégorie [Streets in Moscow by name](https://commons.wikimedia.org/wiki/Category:Streets_in_Moscow_by_name), état non consigné, import du 28 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Extraction des titres, romanisation, normalisation et dédoublonnage. Attribution : contributeurs de Wikimedia Commons et historiques des pages liées. |
| `fr-lieux-villes`, `fr-lieux-villages` | [Découpage administratif Etalab / INSEE](https://github.com/datagouv/decoupage-administratif), export non consigné, récupéré le 29 juillet 2026 | [Licence Ouverte 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0) | Filtrage par territoire et population, tri ou échantillonnage déterministe. Attribution : Etalab / INSEE, données modifiées. |
| `fr-lieux-rivieres`, `fr-lieux-montagnes` | [GeoNames `FR.txt`](https://download.geonames.org/export/dump/FR.zip), export quotidien récupéré le 29 juillet 2026 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Filtrage des types géographiques puis échantillonnage déterministe. Attribution : GeoNames, données modifiées. |
| `ru-lieux-localites-romanise` | [GeoNames `RU.txt`](https://download.geonames.org/export/dump/RU.zip), export quotidien récupéré le 9 août 2026 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Filtrage des localités habitées, sélection des 5 000 plus peuplées, utilisation du nom ASCII romanisé et dédoublonnage. Attribution : GeoNames, données modifiées. |
| `fr-lieux-fleuves` | [Liste de fleuves de France](https://fr.wikipedia.org/wiki/Liste_de_fleuves_de_France), révision non consignée, récupérée le 29 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Extraction du tableau, nettoyage des annotations et sélection de 200 noms. Attribution : contributeurs et historique de l’article. |
| `fr-nature-mineraux` | [Liste de minéraux](https://fr.wikipedia.org/wiki/Liste_de_min%C3%A9raux), révisions non consignées, récupérées le 29 juillet 2026 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Agrégation des pages alphabétiques, nettoyage et dédoublonnage. Attribution : contributeurs et historiques des articles. |

Les URL, licences, dates, transformations et attributions sont également
enregistrées avec chaque corpus dans les fichiers JSON. Le script
`scripts/apply-dataset-metadata.mjs` vérifie que chaque corpus actif possède
une fiche.

## Corpus suspendus

Les corpus `fr-nature-animaux`, `fr-nature-plantes` et
`fr-nature-champignons`, auparavant dérivés de TAXREF, ont été retirés des
fichiers distribués le 1er août 2026. La fiche GBIF de TAXREF affiche à la fois
CC BY 4.0 et des conditions spécifiques interdisant de transmettre une copie
ou d’en mettre une partie en ligne sans autorisation préalable. Ils resteront
suspendus jusqu’à clarification écrite du producteur ou remplacement par une
source compatible.

Référence de l’anomalie : [fiche TAXREF sur GBIF](https://www.gbif.org/dataset/0e61f8fe-7d25-4f81-ada7-d970bbb2c6d6).

## Redistribution

- Conserver ce fichier et `THIRD_PARTY_NOTICES.md` avec toute copie des corpus.
- Pour les corpus CC BY/CC BY-SA, conserver l’attribution, le lien de licence
  et l’indication des transformations.
- Redistribuer les fichiers dérivés de CC BY-SA sous CC BY-SA 4.0.
- Vérifier séparément le corpus `en-mots` avant tout usage commercial.
