#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import {
  extractFrenchAlternate,
  localizedPathCandidate
} from "./localize-distribution-sources.mjs";

const root = resolve(import.meta.dirname, "..");
const errors = [];
const languages = ["fr", "en", "es", "de", "it", "ja"];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const [
  html,
  css,
  i18nSource,
  genderDifferencesSource,
  app,
  firebaseSource,
  firebaseBundle,
  dataSource,
  availabilitySource,
  sourceLocalesSource,
  distributionsSource,
  updateDataSource,
  serviceWorker,
  manifestSource,
  firestoreRules
] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "styles.css"), "utf8"),
  readFile(resolve(root, "i18n.js"), "utf8"),
  readFile(resolve(root, "gender-differences.js"), "utf8"),
  readFile(resolve(root, "app.js"), "utf8"),
  readFile(resolve(root, "firebase-sync.source.js"), "utf8"),
  readFile(resolve(root, "firebase-sync.js"), "utf8"),
  readFile(resolve(root, "data/pokedex-data.js"), "utf8"),
  readFile(resolve(root, "data/shiny-availability.js"), "utf8"),
  readFile(resolve(root, "data/distribution-source-locales.js"), "utf8"),
  readFile(resolve(root, "data/distributions.js"), "utf8"),
  readFile(resolve(root, "tools/update-data.mjs"), "utf8"),
  readFile(resolve(root, "sw.js"), "utf8"),
  readFile(resolve(root, "manifest.webmanifest"), "utf8"),
  readFile(resolve(root, "firestore.rules"), "utf8")
]);

for (const [source, name] of [
  [i18nSource, "i18n.js"],
  [genderDifferencesSource, "gender-differences.js"],
  [app, "app.js"],
  [availabilitySource, "data/shiny-availability.js"],
  [sourceLocalesSource, "data/distribution-source-locales.js"],
  [distributionsSource, "data/distributions.js"],
  [firebaseBundle, "firebase-sync.js"],
  [serviceWorker, "sw.js"]
]) {
  try {
    new vm.Script(source, { filename: name });
  } catch (error) {
    errors.push(`${name} contient une erreur de syntaxe : ${error.message}`);
  }
}

let data;
try {
  const context = { window: {} };
  vm.runInNewContext(dataSource, context, { filename: "pokedex-data.js" });
  data = context.window.SHINYDEX_DATA;
} catch (error) {
  errors.push(`Base Pokédex illisible : ${error.message}`);
}

let availability;
let sourceLocales;
let distributions;
try {
  const context = { window: {} };
  vm.runInNewContext(availabilitySource, context, { filename: "shiny-availability.js" });
  vm.runInNewContext(sourceLocalesSource, context, { filename: "distribution-source-locales.js" });
  vm.runInNewContext(distributionsSource, context, { filename: "distributions.js" });
  availability = context.window.SHINYDEX_AVAILABILITY;
  sourceLocales = context.window.SHINYDEX_DISTRIBUTION_SOURCE_LOCALES;
  distributions = context.window.SHINYDEX_DISTRIBUTIONS;
} catch (error) {
  errors.push(`Référentiels de légalité, de sources localisées ou de distribution illisibles : ${error.message}`);
}

let translations;
try {
  const context = { window: {} };
  vm.runInNewContext(i18nSource, context, { filename: "i18n.js" });
  translations = context.window.SHINYDEX_I18N;
} catch (error) {
  errors.push(`Traductions illisibles : ${error.message}`);
}

let manifest;
try {
  manifest = JSON.parse(manifestSource);
} catch (error) {
  errors.push(`Manifest invalide : ${error.message}`);
}

check(data?.schemaVersion === 2, "Version de schéma inattendue.");
check(availability?.schemaVersion === 1, "Version du référentiel de légalité inattendue.");
check(availability?.unavailableSpeciesIds?.length === 24, "Les 24 espèces sans shiny légal ne sont pas toutes référencées.");
check(new Set(availability?.unavailableSpeciesIds || []).size === 24, "Le référentiel contient des espèces indisponibles dupliquées.");
check(availability?.legalExceptions?.some(entry => entry.speciesId === 721), "Volcanion doit rester classé comme shiny légal.");
check(availability?.legalExceptions?.some(entry => entry.speciesId === 25 && entry.formIds?.includes(10267)), "Le Pikachu Casquette Partenaire doit rester une exception légale.");
check(distributions?.schemaVersion === 1, "Version du référentiel de distributions inattendue.");
check(distributions?.items?.length >= 2, "Les distributions mondiales vérifiées sont absentes.");
check(sourceLocales?.schemaVersion === 1, "Version du référentiel de sources localisées inattendue.");
check(distributions?.items?.every(item => {
  const canonical = item.sourceUrls?.en || item.sourceUrl;
  const localized = sourceLocales?.sources?.[canonical];
  return canonical?.startsWith("https://")
    && localized?.en === canonical
    && localized?.fr?.startsWith("https://");
}), "Chaque distribution doit être reliée à sa source officielle française et anglaise.");
check(
  extractFrenchAlternate(
    '<link rel="alternate" hreflang="fr-FR" href="/fr/actualites/exemple">',
    "https://www.pokemon.com/uk/news/example"
  ) === "https://www.pokemon.com/fr/actualites/exemple",
  "Le détecteur hreflang ne retrouve pas une page française officielle."
);
check(
  localizedPathCandidate("https://legends.pokemon.com/en-us/news/example")
    === "https://legends.pokemon.com/fr-fr/news/example",
  "Le chemin régional français stable n’est pas généré correctement."
);
check(distributions?.items?.find(item => item.id === "home-alpha-starters-za-2026")
  ?.title?.fr?.includes("Barons"),
  "La terminologie française officielle « Pokémon Barons » n’est pas utilisée.");
check(data?.speciesCount >= 1025, "Les 1 025 espèces Pokémon ne sont pas toutes présentes.");
check(data?.entries?.length === data?.appearanceCount, "Le nombre de variantes est incohérent.");
check(new Set(data?.entries?.map(entry => entry.speciesId)).size === data?.speciesCount, "Une espèce n’a aucune variante.");
check(data?.visualCount < data?.appearanceCount, "Les sprites identiques des deux sexes ne sont pas mutualisés.");
check(new Set(data?.entries?.map(entry => entry.key)).size === data?.entries?.length, "Des identifiants de variante sont dupliqués.");
check(data?.normalSheets?.length === data?.shinySheets?.length, "Les planches normales et shiny ne correspondent pas.");
check(data?.normalSheets?.length > 0, "Aucune planche de sprites.");
check(data?.homeNormalSheets?.length === data?.homeShinySheets?.length,
  "Les planches Pokémon HOME normales et shiny ne correspondent pas.");
check(data?.homeNormalSheets?.length > 0 && data?.homeVisualCount > 0,
  "Les rendus 3D Pokémon HOME sont absents.");
check(data?.homeCellSize === 128 && data?.homeAtlasColumns === 15 && data?.homeAtlasSize === 1920,
  "La géométrie des planches Pokémon HOME est inattendue.");
check(updateDataSource.includes("/other/home") && updateDataSource.includes("function buildHomeAtlas"),
  "La reconstruction ne télécharge pas les rendus Pokémon HOME officiels.");
check(updateDataSource.includes("play.pokemonshowdown.com/sprites")
  && updateDataSource.includes("ogerpon-tealtera")
  && updateDataSource.includes("ogerpon-cornerstonetera")
  && updateDataSource.includes("pikachu-original")
  && updateDataSource.includes("pikachu-world"),
  "Les sprites exacts trouvés dans Pokémon Showdown ne sont pas tous reliés à leur source.");
check(
  updateDataSource.includes("pichu-spiky-eared-normal.png")
    && updateDataSource.includes("pichu-spiky-eared-shiny.png"),
  "Les sprites locaux de Pichu Troizépi ne sont pas protégés contre les reconstructions automatiques."
);
check(languages.every(language => data?.languages?.includes(language)), "Les six langues de données ne sont pas disponibles.");

const florizarre = data?.entries?.filter(entry => entry.speciesId === 3 && !entry.exceptional) || [];
const megaEntries = data?.entries?.filter(entry => entry.exceptionReason === "mega") || [];
const gigamaxEntries = data?.entries?.filter(entry => entry.exceptionReason === "gigamax") || [];
const visualCount = speciesId => new Set(
  data?.entries?.filter(entry => entry.speciesId === speciesId).map(
    entry => entry.displayKey || `${entry.sheet}:${entry.slot}`
  )
).size;
check(florizarre.length === 2, "Florizarre doit proposer exactement un mâle et une femelle.");
check(new Set(florizarre.map(entry => entry.gender)).size === 2, "Les deux sexes de Florizarre sont incomplets.");
check(visualCount(1) === 1, "Bulbizarre ne doit avoir qu’une apparence malgré ses deux sexes.");
check(visualCount(2) === 1, "Herbizarre ne doit avoir qu’une apparence malgré ses deux sexes.");
check(visualCount(3) >= 5, "Florizarre doit réunir ses sexes, sa Méga-Évolution et sa forme Gigamax.");
check(visualCount(19) === 3, "Rattata doit avoir trois apparences : deux de Kanto et une d’Alola.");
check(visualCount(58) === 2, "Caninos doit avoir deux apparences régionales, pas quatre variantes de sexe.");
check(visualCount(648) === 2, "Les formes Chant et Danse de Meloetta doivent être présentes.");
check(visualCount(888) === 2, "Les formes Héros Aguerri et Épée Suprême de Zacian doivent être présentes.");
check(visualCount(889) === 2, "Les formes Héros Aguerri et Bouclier Suprême de Zamazenta doivent être présentes.");
check(megaEntries.length >= 150, "Les Méga-Évolutions disponibles ne sont pas toutes intégrées.");
check(new Set(megaEntries.map(entry => entry.speciesId)).size >= 75, "Trop peu d’espèces avec Méga-Évolution sont présentes.");
check(gigamaxEntries.length >= 60, "Les formes Gigamax disponibles ne sont pas toutes intégrées.");
check(new Set(gigamaxEntries.map(entry => entry.speciesId)).size >= 30, "Trop peu d’espèces Gigamax sont présentes.");
check(megaEntries.every(entry => entry.exceptional), "Une Méga-Évolution n’est pas classée en exception.");
check(gigamaxEntries.every(entry => entry.exceptional), "Une forme Gigamax n’est pas classée en exception.");
check(data?.entries?.filter(entry => entry.speciesId === 646 && entry.formNames.fr.includes("Kyurem ")).every(
  entry => entry.exceptionReason === "fusion"
), "Les fusions de Kyurem ne sont pas classées en exception.");
check(data?.entries?.find(entry => entry.speciesId === 648 && entry.formNames.fr === "Forme Danse")?.exceptional,
  "La Forme Danse de Meloetta doit être une exception.");
const nemelios = data?.entries?.filter(entry => entry.speciesId === 668) || [];
check(
  nemelios.length === 4
    && nemelios.map(entry => entry.gender).join(",") === "male,female,male,female"
    && !nemelios[0]?.exceptional
    && !nemelios[1]?.exceptional
    && nemelios[2]?.formNames?.fr === "Méga-Némélios"
    && nemelios[3]?.formNames?.fr === "Méga-Némélios",
  "Némélios doit être rangé mâle, femelle, Méga mâle, Méga femelle."
);
const formPairingErrors = [];
for (const speciesId of new Set(data?.entries?.map(entry => entry.speciesId) || [])) {
  const entries = data.entries.filter(entry => entry.speciesId === speciesId);
  const closedForms = new Set();
  let activeForm = "";
  for (const entry of entries) {
    if (entry.formKey !== activeForm) {
      if (closedForms.has(entry.formKey)) formPairingErrors.push(speciesId);
      if (activeForm) closedForms.add(activeForm);
      activeForm = entry.formKey;
    }
  }
  for (const formKey of new Set(entries.map(entry => entry.formKey))) {
    const genders = entries.filter(entry => entry.formKey === formKey).map(entry => entry.gender);
    if (
      genders.includes("male")
      && genders.includes("female")
      && genders.indexOf("male") > genders.indexOf("female")
    ) formPairingErrors.push(speciesId);
  }
}
check(formPairingErrors.length === 0,
  `Les formes/sexe ne restent pas toujours groupées par couple : ${[...new Set(formPairingErrors)].join(", ")}`);
const zygarde = data?.entries?.filter(entry => entry.speciesId === 718) || [];
check(zygarde.filter(entry => entry.formNames.fr === "Forme 10 %").length === 1,
  "Zygarde contient encore plusieurs Formes 10 %." );
check(zygarde.some(entry => entry.formNames.fr === "Méga-Zygarde"
  && entry.spritePlaceholder
  && !entry.homeSpriteFallback),
  "La fiche provisoire de Méga-Zygarde est absente.");
const poltchageistForms = data?.entries?.filter(entry => entry.speciesId === 1012) || [];
check(
  poltchageistForms.length === 2
    && poltchageistForms.some(entry => entry.formNames.fr === "Forme Imitation")
    && poltchageistForms.some(entry => entry.formNames.fr === "Forme Onéreuse" && !entry.spritePlaceholder),
  "Les formes Imitation et Onéreuse de Poltchageist sont incomplètes."
);
const theffroyableForms = data?.entries?.filter(entry => entry.speciesId === 1013) || [];
check(
  theffroyableForms.length === 2
    && theffroyableForms.some(entry => entry.formNames.fr === "Forme Médiocre")
    && theffroyableForms.some(entry => entry.formNames.fr === "Forme Exceptionnelle" && !entry.spritePlaceholder),
  "Les formes Médiocre et Exceptionnelle de Théffroyable sont incomplètes."
);
const miniorMeteor = data?.entries?.filter(
  entry => entry.speciesId === 774 && entry.formNames.fr === "Forme Météore"
) || [];
check(miniorMeteor.length === 1 && miniorMeteor[0].exceptional,
  "Météno doit avoir une seule Forme Météore, classée en exception.");
const ogerponTerastallized = data?.entries?.filter(
  entry => entry.speciesId === 1017 && entry.formNames.fr.startsWith("Téracristallisation")
) || [];
check(
  ogerponTerastallized.length === 4
    && ogerponTerastallized.every(entry => entry.exceptional
      && !entry.spritePlaceholder
      && entry.homeSpriteFallback)
    && Math.min(...ogerponTerastallized.map(entry => entry.formOrder)) > 1433,
  "Les quatre fiches Téracristallisation d’Ogerpon doivent avoir un sprite 2D exact et suivre les masques."
);
const pikachuCapFormIds = new Set([10196, 10197, 10198, 10199, 10200, 10201, 10319]);
const pikachuCaps = data?.entries?.filter(
  entry => entry.speciesId === 25 && pikachuCapFormIds.has(entry.formId)
) || [];
check(pikachuCaps.length === 14 && pikachuCaps.every(entry => !entry.homeSpriteFallback),
  "Les sept Pikachu à casquette n’utilisent pas tous leur rendu HOME exact.");
check(data?.entries?.find(entry => entry.speciesId === 888 && entry.formNames.fr === "Épée Suprême")?.exceptional,
  "La forme couronnée de Zacian doit être une exception.");
check(data?.entries?.filter(entry => entry.speciesId === 29).every(entry => entry.gender === "female"), "Nidoran♀ ne doit pas proposer de mâle.");
check(data?.entries?.filter(entry => entry.speciesId === 32).every(entry => entry.gender === "male"), "Nidoran♂ ne doit pas proposer de femelle.");
check(data?.entries?.filter(entry => entry.speciesId === 81).every(entry => entry.gender === "genderless"), "Magnéti doit rester asexué.");
check(data?.entries?.filter(entry => entry.speciesId === 201).length >= 28, "Les 28 formes de Zarbi sont absentes.");
check(data?.entries?.filter(entry => entry.speciesId === 585).length >= 8, "Les saisons et sexes de Vivaldaim sont incomplets.");
for (const [speciesId, name] of [[664, "Lépidonille"], [665, "Pérégrain"]]) {
  const entries = data?.entries?.filter(entry => entry.speciesId === speciesId) || [];
  check(entries.length === 2 && new Set(entries.map(entry => entry.formKey)).size === 1,
    `${name} doit avoir une seule forme, déclinée en mâle et femelle.`);
  check(Object.keys(data?.keyAliases || {}).filter(key => key.startsWith(`${speciesId}:`)).length === 38,
    `Les anciennes formes artificielles de ${name} ne sont pas toutes migrées.`);
}
check(data?.entries?.filter(entry => entry.speciesId === 666).length === 40,
  "Les 20 motifs mâle/femelle de Prismillon doivent rester disponibles.");
check(data?.entries?.every(entry =>
  entry.key
  && entry.names?.fr
  && languages.every(language => entry.names?.[language])
  && languages.every(language => typeof entry.formNames?.[language] === "string")
  && ["male", "female", "genderless"].includes(entry.gender)
  && typeof entry.exceptional === "boolean"
  && typeof entry.exceptionReason === "string"
  && Number.isInteger(entry.formOrder)
  && typeof entry.formKey === "string"
  && typeof entry.displayKey === "string"
  && typeof entry.spritePlaceholder === "boolean"
  && typeof entry.homeSpriteFallback === "boolean"
  && (!entry.exceptional || ["mega", "gigamax", "fusion", "item", "temporary", "battle"].includes(entry.exceptionReason))
  && Number.isInteger(entry.visualVariantCount)
  && Number.isInteger(entry.sheet)
  && Number.isInteger(entry.homeSheet)
  && Number.isInteger(entry.homeSlot)
), "Une variante Pokémon est invalide ou mal traduite.");
check(Array.isArray(data?.evolutions) && data.evolutions.length >= 480,
  "Le graphe local des évolutions est absent ou incomplet.");
check(data?.evolutions?.some(edge => edge.from === 63 && edge.to === 64)
  && data?.evolutions?.some(edge => edge.from === 64 && edge.to === 65),
  "La lignée évolutive d’Abra est absente.");
check(data?.types?.every(type =>
  languages.every(language => data.typeNames?.[type]?.[language])
), "Les noms de types ne sont pas disponibles dans les six langues.");

for (const language of languages) {
  const missing = Object.keys(translations?.strings?.fr || {}).filter(
    key => !translations?.strings?.[language]?.[key]
  );
  check(missing.length === 0, `Textes ${language} manquants : ${missing.join(", ")}`);
}

for (const file of [...(data?.normalSheets || []), ...(data?.shinySheets || [])]) {
  const path = resolve(root, file);
  try {
    await access(path);
    const metadata = await sharp(path).metadata();
    check(metadata.format === "webp", `${file} n’est pas un fichier WebP.`);
    check(metadata.width === data.atlasSize && metadata.height === data.atlasSize, `${file} a une taille inattendue.`);
  } catch (error) {
    errors.push(`${file} est introuvable ou invalide : ${error.message}`);
  }
}

for (const file of [...(data?.homeNormalSheets || []), ...(data?.homeShinySheets || [])]) {
  const path = resolve(root, file);
  try {
    await access(path);
    const metadata = await sharp(path).metadata();
    check(metadata.format === "webp", `${file} n’est pas un fichier WebP.`);
    check(metadata.width === data.homeAtlasSize && metadata.height === data.homeAtlasSize,
      `${file} a une taille HOME inattendue.`);
  } catch (error) {
    errors.push(`${file} est introuvable ou invalide : ${error.message}`);
  }
}

try {
  const [ditto2d, ditto3d] = await Promise.all([
    sharp(resolve(root, "assets/ditto-2d.webp")).metadata(),
    sharp(resolve(root, "assets/ditto-3d.webp")).metadata()
  ]);
  check(ditto2d.format === "webp" && ditto2d.width === 96 && ditto2d.height === 96 && ditto2d.hasAlpha,
    "Le Métamorph 2D du bouton est invalide.");
  check(ditto3d.format === "webp" && ditto3d.width === 96 && ditto3d.height === 96 && ditto3d.hasAlpha,
    "Le Métamorph 3D du bouton est invalide.");
} catch (error) {
  errors.push(`Les deux états du bouton Métamorph sont absents : ${error.message}`);
}

try {
  const pichuTroizepi = data?.entries?.find(entry =>
    entry.speciesId === 172 && entry.formId === 10065
  );
  if (!pichuTroizepi) {
    errors.push("La forme Pichu Troizépi est absente de la base.");
  } else {
    const left = (pichuTroizepi.slot % data.atlasColumns) * data.cellSize;
    const top = Math.floor(pichuTroizepi.slot / data.atlasColumns) * data.cellSize;
    const kinds = [
      ["normal", "pichu-spiky-eared-normal.png", data.normalSheets],
      ["shiny", "pichu-spiky-eared-shiny.png", data.shinySheets]
    ];
    for (const [kind, overrideName, sheets] of kinds) {
      const overridePath = resolve(root, "tools/source-overrides", overrideName);
      const metadata = await sharp(overridePath).metadata();
      check(
        metadata.format === "png"
          && metadata.width === 80
          && metadata.height === 80
          && metadata.hasAlpha,
        `Le sprite ${kind} de Pichu Troizépi doit être un PNG 80 × 80 transparent.`
      );
      const expected = await sharp(overridePath)
        .resize(data.cellSize, data.cellSize, { fit: "contain", kernel: "nearest" })
        .flatten({ background: "#ffffff" })
        .raw()
        .toBuffer();
      const actual = await sharp(resolve(root, sheets[pichuTroizepi.sheet]))
        .extract({ left, top, width: data.cellSize, height: data.cellSize })
        .flatten({ background: "#ffffff" })
        .raw()
        .toBuffer();
      check(actual.equals(expected), `La planche ${kind} n’utilise pas le bon sprite de Pichu Troizépi.`);
    }
  }
} catch (error) {
  errors.push(`Validation des sprites de Pichu Troizépi impossible : ${error.message}`);
}

try {
  const [iconSvg, icon192, icon512] = await Promise.all([
    readFile(resolve(root, "assets/shiny-pokeball.svg"), "utf8"),
    sharp(resolve(root, "assets/shiny-pokeball-192.png")).metadata(),
    sharp(resolve(root, "assets/shiny-pokeball-512.png")).metadata()
  ]);
  check(iconSvg.includes("Poké Ball shiny") && iconSvg.includes('id="glow"'), "Le favicon Poké Ball shiny est invalide.");
  check(icon192.format === "png" && icon192.width === 192 && icon192.height === 192, "L’icône Poké Ball 192 px est invalide.");
  check(icon512.format === "png" && icon512.width === 512 && icon512.height === 512, "L’icône Poké Ball 512 px est invalide.");
} catch (error) {
  errors.push(`Le favicon Poké Ball shiny est absent : ${error.message}`);
}

for (const id of [
  "languageFlag", "languageSelect", "searchInput", "generationFilter", "typeFilter", "statusFilter",
  "sortSelect", "pokemonGrid", "ownedCount", "speciesCount", "copyCount", "variantDialog",
  "variantGrid", "genderDifferenceNote", "genderDifferenceText", "variantCardTemplate",
  "resetDialog", "importInput", "accountButton",
  "informationPanel", "informationTitle", "distributionGrid", "distributionEmpty", "distributionUpdatedAt", "distributionCount",
  "distributionTicker",
  "evolutionTitle", "evolutionCount", "evolutionSuggestions", "evolutionEmpty",
  "evolutionDialog", "evolutionDialogTitle", "evolutionDialogIntro", "evolutionDialogSource",
  "evolutionDialogGrid", "closeEvolutionButton", "lineageButton",
  "authDialog", "authEmail", "authPassword", "signInButton", "createAccountButton",
  "syncNowButton", "signOutButton", "spriteModeButton", "spriteModeValue"
]) {
  check(html.includes(`id="${id}"`), `Élément #${id} absent.`);
}

check(html.includes("i18n.js"), "Le module multilingue n’est pas chargé.");
check(html.includes("gender-differences.js"), "Les descriptions des différences sexuelles ne sont pas chargées.");
check(html.includes("data/pokedex-data.js"), "La base locale n’est pas chargée.");
check(html.includes("data/shiny-availability.js"), "Le référentiel de légalité shiny n’est pas chargé.");
check(html.includes("data/distributions.js"), "Le référentiel de distributions n’est pas chargé.");
const pokemonTemplatePosition = html.indexOf('id="pokemonCardTemplate"');
const pokemonSpritePosition = html.indexOf('class="pokemon-sprite"', pokemonTemplatePosition);
const unobtainableBadgePosition = html.indexOf('class="unobtainable-badge"', pokemonTemplatePosition);
check(
  pokemonSpritePosition < unobtainableBadgePosition,
  "Le badge de shiny impossible doit être placé après le sprite afin de ne pas le masquer."
);
check(
  /\.unobtainable-badge\s*\{[^}]*position:\s*static/s.test(css),
  "Le badge de shiny impossible empiète encore sur le sprite."
);
const dashboardPosition = html.indexOf('class="dashboard"');
const informationPosition = html.indexOf('id="informationPanel"');
const collectionPosition = html.indexOf('class="collection-panel"');
check(html.includes('<details class="information-panel" id="informationPanel"'),
  "Le panneau d’informations n’est pas repliable.");
check(dashboardPosition < informationPosition && informationPosition < collectionPosition,
  "Le panneau d’informations doit être placé entre les statistiques et la collection.");
check(/id="distributionGrid"[^>]*tabindex="0"/.test(html),
  "Le carrousel des distributions n’est pas accessible au clavier.");
check(css.includes("grid-auto-flow: column") && css.includes("overflow-x: auto"),
  "Les distributions ne défilent pas horizontalement.");
check(css.includes("scroll-snap-type: inline mandatory") && css.includes("scroll-snap-align: start"),
  "Le défilement horizontal des distributions n’est pas aimanté carte par carte.");
check(html.includes('class="information-ticker"') && html.includes('id="distributionTicker"'),
  "Le bandeau des titres est absent de l’état fermé.");
check(app.includes("function renderDistributionTicker") && app.includes("renderDistributionTicker(active)"),
  "Les titres des distributions ne sont pas injectés dans le bandeau.");
check(css.includes("@keyframes distributionTickerScroll")
  && css.includes(".information-panel[open] .information-ticker"),
  "Le bandeau ne défile pas uniquement lorsque le panneau est fermé.");
check(app.includes("information-ticker__separator--sequence-end")
  && css.includes("margin-right: clamp(68px, 6vw, 120px)"),
  "Les répétitions complètes du bandeau ne sont pas suffisamment espacées.");
check(html.includes("assets/shiny-pokeball.svg"), "Le favicon Poké Ball shiny n’est pas relié.");
check(languages.every(language => i18nSource.includes(`assets/flags/${language}.svg`)), "Les six drapeaux de langue ne sont pas configurés.");
check(html.includes("manifest.webmanifest"), "Le manifeste PWA n’est pas relié.");
check(!/compact|densityButton|is-compact/i.test(`${html}\n${app}\n${css}`), "Le mode compact n’a pas été entièrement supprimé.");
check(!html.toLowerCase().includes("cliquer pour marquer"), "La consigne répétée est encore présente dans les fiches.");
check(html.includes('data-i18n="instruction"'), "La consigne générale au-dessus du Pokédex est absente.");
check(!html.includes("<kbd"), "L’indicateur « / » est encore affiché dans le champ de recherche.");
check(html.includes('data-i18n="exceptionGuideText"'), "L’explication du palier Exception est absente.");
check(css.includes("content-visibility: auto"), "Le rendu différé des cartes n’est pas activé.");
check(css.includes("--type-color"), "Les couleurs propres aux types sont absentes.");
check(/\.language-control select option\s*\{[^}]*background:\s*var\(--surface-raised\)/s.test(css), "Le menu des langues n’utilise pas les couleurs sombres du site.");
check(css.includes("minmax(min(100%, var(--card-min-width)), 1fr)"), "La grille Pokémon n’est pas fluide sur toutes les largeurs.");
check(html.includes('id="cardSizeButton"'), "Le bouton d’agrandissement des fiches Pokémon est absent.");
check(app.includes('cardSize: "normal"') && app.includes("function cycleCardSize"),
  "La préférence de taille des fiches n’est pas enregistrée.");
check(css.includes('[data-card-size="large"]') && css.includes('[data-card-size="xlarge"]'),
  "Les deux niveaux d’agrandissement des fiches sont absents.");
check(html.includes('class="ditto-sprite ditto-sprite--2d"')
  && html.includes('class="ditto-sprite ditto-sprite--3d"')
  && app.includes('spriteMode: "2d"')
  && app.includes("function toggleSpriteMode")
  && app.includes("DATA.homeNormalSheets"),
  "Le bouton Métamorph 2D / 3D ou sa préférence persistante est incomplet.");
check(css.includes("@keyframes dittoEvolutionOut")
  && css.includes("@keyframes dittoEvolutionIn")
  && css.includes("@keyframes dittoEvolutionFlash"),
  "La transformation animée de Métamorph est absente.");
check(css.includes("100vw - clamp(64px, 6vw, 220px)"), "La mise en page n’exploite pas les écrans ultralarges.");
check(css.includes("grid-auto-rows: var(--variant-card-height)"), "Les lignes du sélecteur peuvent encore comprimer les variantes.");
check(css.includes("min-height: var(--variant-card-height)"), "La hauteur minimale des cartes de variante n’est pas verrouillée.");
check(css.includes("align-content: start"), "La grille de variantes étire encore ses lignes pour remplir la fenêtre.");
check(css.includes("scrollbar-gutter: stable"), "Le défilement des nombreuses variantes n’est pas stabilisé.");
check(html.includes('class="stat-spark"'), "L’icône du total de shiny n’a pas été remplacée.");
check(html.includes('class="pokemon-card__trophy"')
  && html.includes('class="status-pokeball"')
  && html.includes('class="pokemon-card__counts"'),
  "Les trophées, la Poké Ball de complétion ou les compteurs des fiches sont absents.");
check(html.includes('class="evolution-panel"') && html.indexOf('class="evolution-panel"') > collectionPosition,
  "Les suggestions d’évolution doivent être placées à la fin du site, après la collection.");
check(app.includes("function speciesAchievement")
  && app.includes("function isFormShinyComplete")
  && app.includes("function renderCardQuantities"),
  "La complétion par forme, les trophées ou les compteurs d’accueil ne sont pas calculés.");
check(app.includes("function evolutionRecommendations")
  && app.includes("quantityFor(entry.key) > 1")
  && app.includes("function renderEvolutionSuggestions"),
  "Les suggestions d’évolution ne protègent pas le dernier exemplaire de chaque variante.");
check(app.includes("function evolutionRecommendationGroups")
  && app.includes("function openEvolutionDialog")
  && html.includes('class="modal evolution-modal"'),
  "Les évolutions ne sont pas regroupées par Pokémon dans une fenêtre dédiée.");
check(app.includes("function formsCanShareEvolution")
  && app.includes("function sourceFormCanEvolve")
  && app.includes("function targetFormCanResultFromEvolution"),
  "Les incompatibilités de forme des évolutions ne sont pas contrôlées.");
check(app.includes("function lineageSpeciesIdsFor")
  && app.includes("evolutionPredecessors")
  && app.includes("depthBySpecies")
  && app.includes("function applyLineageFilter")
  && html.includes('id="lineageButton"'),
  "Le filtre de lignée évolutive ou son tri par stade est absent des fenêtres de variantes.");
check(css.includes(".is-form-complete .status-check")
  && css.includes(".pokemon-card__trophy.is-silver")
  && css.includes(".pokemon-card__trophy.is-gold")
  && css.includes("@keyframes statusPokeballSparkle")
  && css.includes("@keyframes trophyGoldSparkle")
  && css.includes("@keyframes trophyGoldGlow"),
  "Les nouveaux indicateurs de collection ne sont pas entièrement stylés.");
check(css.includes(".pokemon-card.is-current-owned")
  && !/\.pokemon-card\.has-owned\s*\{/.test(css),
  "La couleur or d’une fiche dépend encore d’une autre forme possédée dans le carrousel.");
check(html.includes('class="pokemon-sprite-frame"')
  && html.includes('class="variant-option__sprite-frame"')
  && /\.sprite-placeholder-badge\s*\{[^}]*position:\s*absolute[^}]*background:\s*rgba\(174, 19, 36/s.test(css)
  && css.includes("rotate(-7deg)")
  && css.includes("white-space: nowrap")
  && css.includes(".pokemon-card__toggle > .sprite-placeholder-badge")
  && css.includes(".variant-option__toggle > .sprite-placeholder-badge"),
  "Le bandeau rouge diagonal des sprites provisoires est absent.");
check(/\.pokemon-card\.is-unobtainable\s*\{[^}]*border-color:\s*rgba\(218, 226, 237/s.test(css)
  && !css.includes("filter: saturate(0.58)"),
  "Les fiches sans shiny légal ne sont pas affichées en argent non estompé.");
check(app.includes("ENABLE_VARIANT_HOVER_OPEN = false"), "L’ouverture au survol des fiches n’est pas désactivée.");
check(app.includes("ENABLE_VARIANT_EXIT_CLOSE = false"), "La fermeture automatique hors du sélecteur n’est pas désactivée.");
check(app.includes("HOVER_DELAY = 2000"), "Le délai de survol n’est plus conservé dans le code.");
check(app.includes("DIALOG_EXIT_DELAY = 2000"), "Le délai de fermeture hors du sélecteur n’est plus conservé dans le code.");
check(app.includes("if (ENABLE_VARIANT_HOVER_OPEN && group.entries.length > 1)"),
  "La logique d’ouverture au survol n’est pas protégée par son réglage.");
check(app.includes("if (!ENABLE_VARIANT_EXIT_CLOSE) return;"),
  "La logique de fermeture hors fenêtre n’est pas protégée par son réglage.");
check(!i18nSource.includes("2 secondes") && !i18nSource.includes("2 seconds"),
  "Une consigne indique encore les anciens comportements temporisés.");
check(app.includes('EXCEPTION_VALUE = "exception"'), "Le palier Exception n’est pas enregistré.");
check(app.includes("(ownedSpecies / eligibleSpeciesIds.size) * 100"), "La complétion n’exclut pas les espèces sans shiny légal.");
check(app.includes('filters.status === "unobtainable"'), "Le filtre des shiny légalement impossibles est absent.");
check(app.includes("function renderDistributions"), "La section des distributions n’est pas rendue.");
check(app.includes("function distributionSourceUrls"),
  "Le lien officiel n’utilise pas le référentiel localisé généré.");
check(app.includes('card.classList.add("is-shiny-preview")'),
  "L’aperçu shiny au survol des fiches n’est pas activé.");
check(app.includes('currentOwned || card.classList.contains("is-shiny-preview")'),
  "Le carrousel ne conserve pas l’aperçu shiny pendant le survol.");
check(app.includes("setInterval(rotateVisibleVariants"), "Le défilement automatique des variantes est absent.");
check(app.includes("% group.visuals.length"), "Le carrousel n’est pas limité aux apparences visuellement différentes.");
check(app.includes("minimumFractionDigits: 2"), "Les faibles pourcentages de complétion sont encore arrondis à zéro.");
check(app.includes("localStorage"), "La sauvegarde locale est absente.");
check(app.includes("requestIdleCallback"), "Le préchargement différé n’est pas configuré.");
check(app.includes("navigator.serviceWorker.register"), "Le mode hors ligne n’est pas activé.");
check(app.includes("window.SHINYDEX_APP"), "Le pont de synchronisation Firebase est absent.");
check(manifest?.display === "standalone", "Le manifeste ne permet pas l’installation.");
check(manifest?.icons?.some(icon => icon.src === "assets/shiny-pokeball-192.png"), "L’icône Poké Ball 192 px est absente du manifeste.");
check(manifest?.icons?.some(icon => icon.src === "assets/shiny-pokeball-512.png"), "L’icône Poké Ball 512 px est absente du manifeste.");
check(firebaseBundle.includes("pokemon-shinydex"), "La configuration Firebase attendue est absente.");
check(firebaseBundle.includes("users") && firebaseBundle.includes("shinydex"), "Le document Firebase Shinydex est absent.");
check(firebaseSource.includes('EXCEPTION_VALUE = "exception"') && firebaseSource.includes("schemaVersion: 2"),
  "La synchronisation Firebase ne prend pas en charge les exceptions.");
check(firestoreRules.includes("request.auth.uid == userId"), "Les règles Firestore ne protègent pas les données par utilisateur.");
check(firestoreRules.includes("match /users/{userId}/apps/shinydex"), "Les règles Firestore ne ciblent pas uniquement le document Shinydex.");
check(serviceWorker.includes("pokemon-shinydex-v16"), "Le cache PWA n’a pas été renouvelé.");
check(serviceWorker.includes("i18n.js")
  && serviceWorker.includes("gender-differences.js")
  && serviceWorker.includes("shiny-pokeball.svg")
  && serviceWorker.includes("ditto-2d.webp")
  && serviceWorker.includes("ditto-3d.webp"),
"Les nouvelles ressources ne sont pas mises en cache.");
check(
  serviceWorker.includes("shiny-availability.js")
    && serviceWorker.includes("distribution-source-locales.js")
    && serviceWorker.includes("distributions.js"),
  "Les référentiels live ne sont pas disponibles hors ligne."
);
check(languages.every(language => serviceWorker.includes(`assets/flags/${language}.svg`)), "Les drapeaux ne sont pas tous disponibles hors ligne.");

const runtime = [
  html, css, i18nSource, genderDifferencesSource, app, firebaseBundle,
  dataSource, availabilitySource, sourceLocalesSource, distributionsSource, serviceWorker
].join("\n").toLowerCase();
for (const forbidden of ["pokeapi.co", "raw.githubusercontent.com"]) {
  check(!runtime.includes(forbidden), `Dépendance réseau interdite dans le site : ${forbidden}`);
}
check(!/<script[^>]+src=["']https?:/i.test(html), "Un script externe empêche le chargement autonome de l’interface.");

try {
  const dom = new JSDOM(html, {
    url: "https://example.test/Pokemon-shinydex/",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function close(returnValue = "") {
    this.returnValue = returnValue;
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  };
  let rotateCards;
  dom.window.setInterval = (callback, delay) => {
    if (delay === 2600) rotateCards = callback;
    return 1;
  };
  dom.window.eval(i18nSource);
  dom.window.eval(genderDifferencesSource);
  dom.window.eval(dataSource);
  dom.window.eval(availabilitySource);
  dom.window.eval(sourceLocalesSource);
  dom.window.eval(distributionsSource);
  dom.window.eval(app);
  await new Promise(resolveDelay => setTimeout(resolveDelay, 80));

  const pokemonTemplate = dom.window.document.getElementById("pokemonCardTemplate");
  const variantTemplate = dom.window.document.getElementById("variantCardTemplate");
  check(!pokemonTemplate.content.querySelector(".pokemon-sprite-frame > .sprite-placeholder-badge")
    && pokemonTemplate.content.querySelector(".pokemon-card__toggle > .sprite-placeholder-badge"),
  "Le bandeau provisoire de l’accueil reste tronqué dans le cadre du sprite.");
  check(!variantTemplate.content.querySelector(".variant-option__sprite-frame > .sprite-placeholder-badge")
    && variantTemplate.content.querySelector(".variant-option__toggle > .sprite-placeholder-badge"),
  "Le bandeau provisoire des variantes reste tronqué dans le cadre du sprite.");

  const cards = dom.window.document.querySelectorAll(".pokemon-card");
  check(cards.length === data.speciesCount, `Le rendu affiche ${cards.length} fiches au lieu d’une par espèce.`);
  const spriteModeButton = dom.window.document.getElementById("spriteModeButton");
  const homeBackgroundSizeFor = displaySize => {
    const scaledAtlasSize = data.homeAtlasSize * displaySize / data.homeCellSize;
    return `${scaledAtlasSize}px ${scaledAtlasSize}px`;
  };
  const initialModeSprite = dom.window.document.querySelector(".pokemon-card .pokemon-sprite");
  check(spriteModeButton.dataset.mode === "2d"
    && spriteModeButton.getAttribute("aria-pressed") === "false"
    && initialModeSprite?.dataset.spriteMode === "2d"
    && initialModeSprite?.style.backgroundImage.includes("sprites-normal-"),
  "Le site ne démarre pas correctement en mode 2D pixel.");
  spriteModeButton.click();
  const homeModeSprite = dom.window.document.querySelector(".pokemon-card .pokemon-sprite");
  check(dom.window.SHINYDEX_APP.getState().preferences.spriteMode === "3d"
    && dom.window.document.documentElement.dataset.spriteMode === "3d"
    && spriteModeButton.dataset.mode === "3d"
    && spriteModeButton.getAttribute("aria-pressed") === "true"
    && dom.window.document.getElementById("spriteModeValue").textContent.includes("HOME")
    && homeModeSprite?.dataset.spriteMode === "3d"
    && homeModeSprite?.style.backgroundImage.includes("sprites-home-normal-"),
  "Le bouton ne bascule pas toutes les fiches vers les rendus 3D Pokémon HOME.");
  homeModeSprite?.closest(".pokemon-card")?.dispatchEvent(new dom.window.Event("pointerenter"));
  check(homeModeSprite?.style.backgroundImage.includes("sprites-home-shiny-"),
    "Le survol en mode 3D n’affiche pas le rendu HOME shiny.");
  homeModeSprite?.closest(".pokemon-card")?.dispatchEvent(new dom.window.Event("pointerleave"));
  check(spriteModeButton.classList.contains("is-switching")
    && spriteModeButton.dataset.direction === "2d-to-3d",
  "Métamorph ne joue pas sa transformation 2D vers 3D.");
  spriteModeButton.click();
  check(dom.window.SHINYDEX_APP.getState().preferences.spriteMode === "2d"
    && dom.window.document.querySelector(".pokemon-card .pokemon-sprite")?.dataset.spriteMode === "2d"
    && spriteModeButton.dataset.direction === "3d-to-2d",
  "Le bouton ne restaure pas le mode 2D ni l’animation inverse.");
  const cardSizeButton = dom.window.document.getElementById("cardSizeButton");
  const initialSpriteBackgroundSize = dom.window.document.querySelector(".pokemon-card .pokemon-sprite")?.style.backgroundSize;
  cardSizeButton.click();
  check(dom.window.document.getElementById("pokemonGrid").dataset.cardSize === "large",
    "Le bouton n’agrandit pas les fiches au premier clic.");
  check(dom.window.document.getElementById("cardSizeValue").textContent === "125 %",
    "Le niveau d’agrandissement courant n’est pas affiché.");
  check(dom.window.document.querySelector(".pokemon-card .pokemon-sprite")?.style.backgroundSize !== initialSpriteBackgroundSize,
    "Le sprite pixel n’est pas réellement agrandi avec sa fiche.");
  check(dom.window.SHINYDEX_APP.getState().preferences.cardSize === "large",
    "La taille agrandie des fiches n’est pas sauvegardée.");
  cardSizeButton.click();
  check(dom.window.document.getElementById("pokemonGrid").dataset.cardSize === "xlarge",
    "Le deuxième clic n’active pas les très grandes fiches.");
  cardSizeButton.click();
  check(dom.window.document.getElementById("pokemonGrid").dataset.cardSize === "normal",
    "Le troisième clic ne rétablit pas la taille normale.");
  check(dom.window.document.querySelectorAll('.pokemon-card[data-species-id="3"]').length === 1, "Florizarre apparaît sur plusieurs fiches.");
  const victiniCard = dom.window.document.querySelector('.pokemon-card[data-species-id="494"]');
  check(victiniCard?.classList.contains("is-unobtainable"), "Victini n’est pas signalé comme shiny légalement impossible.");
  check(!victiniCard?.querySelector(".unobtainable-badge")?.hidden, "Le badge de légalité de Victini est absent.");
  check(victiniCard?.querySelector(".pokemon-card__toggle")?.disabled, "Le contrôle shiny de Victini doit rester visible mais inactif.");
  check(victiniCard?.querySelector(".pokemon-card__trophy")?.hidden,
    "Une espèce dont aucun shiny légal n’existe ne doit recevoir aucun trophée.");
  check(
    Number(dom.window.document.getElementById("speciesTotal").textContent.replace(/\D/g, "")) === data.speciesCount - 24,
    "Les 24 espèces impossibles ne sont pas exclues de la complétion."
  );
  check(dom.window.document.querySelectorAll("#distributionGrid .distribution-card").length >= 2,
    "Les distributions mondiales en cours ne sont pas affichées.");
  const frenchDistributionSources = [
    ...dom.window.document.querySelectorAll("#distributionGrid .distribution-card__source")
  ];
  check(frenchDistributionSources.some(source => source.href.includes("pokemon.com/fr/actualites/")),
    "La source française officielle de Volcanion n’est pas utilisée en français.");
  check(frenchDistributionSources.every(source => source.hreflang === "fr"),
    "La langue des liens officiels français n’est pas indiquée.");
  check(dom.window.document.querySelectorAll("#distributionTicker .information-ticker__item").length >= 4,
    "Les titres des distributions ne sont pas répétés dans le bandeau défilant.");
  check(dom.window.document.querySelectorAll(
    "#distributionTicker .information-ticker__separator--sequence-end"
  ).length >= 6, "Chaque répétition complète du bandeau doit recevoir son espacement.");
  check(dom.window.document.getElementById("distributionTicker")?.textContent.includes("Volcanion shiny"),
    "Le bandeau fermé ne reprend pas le titre français de la distribution.");

  const cardFor = speciesId => dom.window.document.querySelector(`.pokemon-card[data-species-id="${speciesId}"]`);
  const badgeCount = speciesId => {
    const badge = cardFor(speciesId)?.querySelector(".variant-badge");
    return badge?.hidden ? 0 : Number(badge?.querySelector("strong")?.textContent);
  };
  check(badgeCount(1) === 0, "Bulbizarre affiche un badge alors que ses sexes ont le même sprite.");
  check(badgeCount(2) === 0, "Herbizarre affiche un badge alors que ses sexes ont le même sprite.");
  check(badgeCount(3) >= 5, "Le badge de Florizarre doit inclure ses apparences Méga et Gigamax.");
  check(badgeCount(19) === 3, "Le badge de Rattata doit indiquer 3.");
  check(badgeCount(58) === 2, "Le badge de Caninos doit indiquer 2.");
  check(cardFor(1)?.querySelector(".pokemon-card__form")?.textContent === "♂ Mâle / ♀ Femelle", "Bulbizarre doit afficher les deux symboles sexuels sans alterner.");
  check(cardFor(29)?.querySelector(".pokemon-card__form")?.textContent.includes("♀ Femelle"), "Une espèce exclusivement femelle doit être indiquée.");
  check(cardFor(32)?.querySelector(".pokemon-card__form")?.textContent.includes("♂ Mâle"), "Une espèce exclusivement mâle doit être indiquée.");
  check(cardFor(81)?.querySelector(".pokemon-card__form")?.textContent.includes("∅ Asexué"), "Une espèce asexuée doit être indiquée.");

  const bulbizarreSprite = cardFor(1)?.querySelector(".pokemon-sprite");
  const bulbizarreNormalImage = bulbizarreSprite?.style.backgroundImage;
  cardFor(1)?.dispatchEvent(new dom.window.Event("pointerenter"));
  check(
    bulbizarreSprite?.style.backgroundImage.includes("sprites-shiny")
      && bulbizarreSprite?.style.backgroundImage !== bulbizarreNormalImage,
    "Le survol d’une fiche de l’accueil n’affiche pas son modèle shiny."
  );
  cardFor(1)?.dispatchEvent(new dom.window.Event("pointerleave"));
  check(
    bulbizarreSprite?.style.backgroundImage === bulbizarreNormalImage,
    "Quitter une fiche de l’accueil ne restaure pas son état réel."
  );

  const bulbizarrePosition = bulbizarreSprite?.style.backgroundPosition;
  const rattataCard = cardFor(19);
  const rattataSprite = rattataCard?.querySelector(".pokemon-sprite");
  const rattataPosition = rattataSprite?.style.backgroundPosition;
  rattataCard?.dispatchEvent(new dom.window.Event("pointerenter"));
  rotateCards?.();
  check(cardFor(1)?.querySelector(".pokemon-sprite")?.style.backgroundPosition === bulbizarrePosition, "Bulbizarre ne doit pas défiler entre deux sexes visuellement identiques.");
  check(rattataSprite?.style.backgroundPosition !== rattataPosition, "Le carrousel de Rattata s’arrête encore pendant le survol.");
  check(rattataSprite?.style.backgroundImage.includes("sprites-shiny"),
    "Le carrousel ne conserve pas le modèle shiny pendant le survol.");
  rattataCard?.dispatchEvent(new dom.window.Event("pointerleave"));

  cardFor(1).querySelector(".pokemon-card__toggle").click();
  check(dom.window.document.getElementById("genderDifferenceNote").hidden, "Bulbizarre ne doit pas afficher d’explication de dimorphisme.");
  dom.window.document.getElementById("variantDialog").close();

  const florizarreCard = dom.window.document.querySelector('.pokemon-card[data-species-id="3"]');
  florizarreCard.dispatchEvent(new dom.window.Event("pointerenter"));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 30));
  check(!dom.window.document.getElementById("variantDialog").hasAttribute("open"),
    "Le survol d’une fiche ouvre encore le sélecteur.");
  florizarreCard.querySelector(".pokemon-card__toggle").click();
  check(dom.window.document.getElementById("variantDialog").hasAttribute("open"), "Un clic sur une espèce à variantes n’ouvre pas le sélecteur.");
  check(dom.window.document.querySelectorAll("#variantGrid .variant-option").length >= 6,
    "Le sélecteur de Florizarre ne propose pas ses sexes, sa Méga-Évolution et sa forme Gigamax.");
  check(!dom.window.document.getElementById("genderDifferenceNote").hidden, "L’explication du dimorphisme de Florizarre est absente.");
  check(dom.window.document.getElementById("genderDifferenceText").textContent.includes("fleur"), "La différence mâle/femelle de Florizarre n’est pas expliquée.");

  spriteModeButton.click();
  const homeVariantSprite = dom.window.document.querySelector("#variantGrid .variant-option__sprite");
  check(homeVariantSprite?.dataset.spriteMode === "3d"
    && homeVariantSprite?.style.backgroundSize === homeBackgroundSizeFor(96),
  "Les sprites HOME des variantes ne sont pas redimensionnés dans leur cadre de 96 px.");
  spriteModeButton.click();

  const firstVariant = dom.window.document.querySelector("#variantGrid .variant-option");
  const firstVariantSprite = firstVariant.querySelector(".variant-option__sprite");
  const beforeSprite = firstVariantSprite.style.backgroundImage;
  firstVariant.dispatchEvent(new dom.window.Event("pointerenter"));
  check(
    firstVariantSprite.style.backgroundImage.includes("sprites-shiny")
      && firstVariantSprite.style.backgroundImage !== beforeSprite,
    "Le survol d’une fiche de la fenêtre n’affiche pas son modèle shiny."
  );
  firstVariant.dispatchEvent(new dom.window.Event("pointerleave"));
  check(
    firstVariantSprite.style.backgroundImage === beforeSprite,
    "Quitter une fiche de la fenêtre ne restaure pas son état réel."
  );
  firstVariant.querySelector(".variant-option__toggle").click();
  const refreshedVariant = dom.window.document.querySelector("#variantGrid .variant-option");
  const afterSprite = refreshedVariant.querySelector(".variant-option__sprite").style.backgroundImage;
  check(refreshedVariant.classList.contains("is-owned"), "Le clic ne marque pas la variante comme possédée.");
  check(beforeSprite !== afterSprite && afterSprite.includes("sprites-shiny"), "Le sprite normal n’est pas remplacé par le shiny.");
  check(refreshedVariant.querySelector(".quantity__input").value === "1", "Le compteur shiny ne démarre pas à 1.");
  check(dom.window.document.getElementById("progressPercent").textContent !== "0 %", "Un premier shiny affiche encore 0 %.");
  const oneSpeciesPercentage = dom.window.document.getElementById("progressPercent").textContent;
  check(dom.window.document.getElementById("speciesCount").textContent === "1", "La première apparence ne représente pas son espèce.");
  check(dom.window.document.getElementById("copyCount").textContent === "1", "Le premier exemplaire n’est pas compté dans le total.");
  check(dom.window.localStorage.getItem("pokemonShinydex:v1"), "Le clic n’est pas sauvegardé dans localStorage.");
  check(typeof dom.window.SHINYDEX_APP?.getState === "function", "Le pont Firebase n’est pas exposé.");
  check(dom.window.SHINYDEX_APP.getState().collection[florizarre[0].key] === 1, "Le pont Firebase ne lit pas la nouvelle collection.");

  const exceptionalVariant = dom.window.document.querySelector("#variantGrid .variant-option.is-exceptional-form");
  const exceptionalKey = exceptionalVariant?.dataset.key;
  exceptionalVariant?.querySelector(".variant-option__toggle").click();
  let refreshedExceptional = dom.window.document.querySelector(`#variantGrid .variant-option[data-key="${exceptionalKey}"]`);
  check(refreshedExceptional?.classList.contains("is-exception"), "Une forme temporaire ne démarre pas au palier Exception.");
  check(refreshedExceptional?.querySelector(".quantity__input").value === "Exception", "Le compteur n’affiche pas le palier Exception.");
  check(dom.window.SHINYDEX_APP.getState().collection[exceptionalKey] === "exception", "Firebase ne reçoit pas la valeur Exception.");
  check(dom.window.document.getElementById("ownedCount").textContent === "2", "Une exception ne compte pas comme apparence.");
  check(dom.window.document.getElementById("copyCount").textContent === "1", "Une exception augmente à tort le total de shiny.");
  check(dom.window.document.getElementById("speciesCount").textContent === "1", "Deux apparences d’une espèce comptent plusieurs espèces.");
  check(dom.window.document.getElementById("progressPercent").textContent === oneSpeciesPercentage,
    "La complétion varie encore selon le nombre d’apparences d’une même espèce.");

  refreshedExceptional.querySelector(".quantity__plus").click();
  refreshedExceptional = dom.window.document.querySelector(`#variantGrid .variant-option[data-key="${exceptionalKey}"]`);
  check(refreshedExceptional?.querySelector(".quantity__input").value === "1", "Exception + ne passe pas à la quantité 1.");
  check(dom.window.document.getElementById("copyCount").textContent === "2", "Le passage d’Exception à 1 n’augmente pas le total.");
  refreshedExceptional.querySelector(".quantity__minus").click();
  refreshedExceptional = dom.window.document.querySelector(`#variantGrid .variant-option[data-key="${exceptionalKey}"]`);
  check(refreshedExceptional?.querySelector(".quantity__input").value === "Exception", "1 − ne revient pas au palier Exception.");
  check(dom.window.document.getElementById("copyCount").textContent === "1", "Le retour à Exception ne retire pas l’exemplaire du total.");
  refreshedExceptional.querySelector(".quantity__minus").click();
  check(dom.window.document.getElementById("removeDialog").hasAttribute("open"),
    "Exception − n’ouvre pas la confirmation « Retirer ce shiny ? ».");
  dom.window.document.getElementById("confirmRemoveButton").dispatchEvent(
    new dom.window.Event("click", { bubbles: true })
  );
  check(!dom.window.SHINYDEX_APP.getState().collection[exceptionalKey], "La confirmation ne retire pas l’exception.");
  dom.window.document.getElementById("removeDialog").close("confirm");

  const variantPanel = dom.window.document.querySelector(".variant-panel");
  variantPanel.dispatchEvent(new dom.window.Event("pointerleave"));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 2050));
  check(dom.window.document.getElementById("variantDialog").hasAttribute("open"),
    "Le sélecteur se ferme encore après deux secondes passées à l’extérieur.");
  dom.window.document.getElementById("variantDialog").close();

  const synchronizedPreferences = {
    ...dom.window.SHINYDEX_APP.getState().preferences,
    language: "fr"
  };
  const bulbizarreMale = data.entries.find(entry =>
    entry.speciesId === 1 && entry.gender === "male" && !entry.exceptional
  );
  const bulbizarreFemale = data.entries.find(entry =>
    entry.speciesId === 1 && entry.gender === "female" && !entry.exceptional
  );
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [bulbizarreMale.key]: 2 },
    preferences: synchronizedPreferences
  });
  const bulbizarreOwnedCard = cardFor(1);
  check(bulbizarreOwnedCard?.querySelector(".pokemon-card__counts")?.textContent.includes("♂ 2"),
    "La fiche d’accueil n’affiche pas le compteur du sprite mâle courant.");
  check(bulbizarreOwnedCard?.querySelectorAll(".pokemon-card__counts > span").length === 1,
    "Une fiche ne doit afficher que les compteurs possédés de l’image courante.");
  check(bulbizarreOwnedCard?.querySelector(".pokemon-card__trophy")?.classList.contains("is-silver"),
    "Le trophée argent n’apparaît pas lorsqu’au moins un sexe de chaque forme est possédé.");
  check(!bulbizarreOwnedCard?.classList.contains("is-form-complete"),
    "La Poké Ball apparaît avant que les deux sexes d’une forme soient possédés.");

  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [bulbizarreMale.key]: 2, [bulbizarreFemale.key]: 1 },
    preferences: synchronizedPreferences
  });
  const completeBulbizarreCard = cardFor(1);
  check(completeBulbizarreCard?.classList.contains("is-form-complete"),
    "La Poké Ball n’apparaît pas lorsque les deux sexes de la forme sont possédés.");
  check(completeBulbizarreCard?.querySelector(".pokemon-card__trophy")?.classList.contains("is-gold"),
    "Le trophée or n’apparaît pas lorsque toutes les formes et tous les sexes sont possédés.");
  check(completeBulbizarreCard?.querySelectorAll(".pokemon-card__counts > span").length === 2,
    "Les deux compteurs mâle et femelle ne sont pas affichés ensemble.");

  const pichuDefaultMale = data.entries.find(entry =>
    entry.speciesId === 172 && entry.formId === 172 && entry.gender === "male"
  );
  const pichuDefaultFemale = data.entries.find(entry =>
    entry.speciesId === 172 && entry.formId === 172 && entry.gender === "female"
  );
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [pichuDefaultMale.key]: 1, [pichuDefaultFemale.key]: 1 },
    preferences: synchronizedPreferences
  });
  check(cardFor(172)?.querySelector(".pokemon-card__trophy")?.classList.contains("is-gold"),
    "Une forme sans shiny légal empêche encore le trophée or des formes légalement obtenables.");

  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: {},
    preferences: synchronizedPreferences
  });
  const taurosCardBefore = cardFor(128);
  const displayedTaurosKey = taurosCardBefore?.dataset.key;
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [displayedTaurosKey]: 1 },
    preferences: synchronizedPreferences
  });
  check(cardFor(128)?.classList.contains("is-current-owned"),
    "La forme de Tauros possédée n’active pas son état doré.");
  rotateCards?.();
  check(cardFor(128)?.dataset.key !== displayedTaurosKey
    && cardFor(128)?.classList.contains("has-owned")
    && !cardFor(128)?.classList.contains("is-current-owned"),
    "Une forme de Tauros non possédée conserve encore la couleur or d’une autre forme du carrousel.");

  const abraMale = data.entries.find(entry =>
    entry.speciesId === 63 && entry.gender === "male" && !entry.exceptional
  );
  const kadabraMale = data.entries.find(entry =>
    entry.speciesId === 64 && entry.gender === "male" && !entry.exceptional
  );
  const openEvolutionChoices = sourceKey => {
    const sourceCard = [...dom.window.document.querySelectorAll("#evolutionSuggestions .evolution-card")]
      .find(card => card.dataset.sourceKey === sourceKey);
    sourceCard?.click();
    return [...dom.window.document.querySelectorAll("#evolutionDialogGrid .evolution-choice")];
  };
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [abraMale.key]: 2 },
    preferences: synchronizedPreferences
  });
  check(dom.window.document.querySelectorAll("#evolutionSuggestions .evolution-card").length === 1,
    "Deux Abra mâles doivent produire une seule fiche d’évolution regroupée.");
  spriteModeButton.click();
  const homeEvolutionCardSprite = dom.window.document.querySelector(
    "#evolutionSuggestions .evolution-card__sprite"
  );
  check(homeEvolutionCardSprite?.dataset.spriteMode === "3d"
    && homeEvolutionCardSprite?.style.backgroundSize === homeBackgroundSizeFor(96),
  "Le sprite HOME du Pokémon évoluable déborde encore de son cadre de 96 px.");
  let evolutionChoices = openEvolutionChoices(abraMale.key);
  check(dom.window.document.querySelector(".evolution-dialog__source-sprite")?.style.backgroundSize
    === homeBackgroundSizeFor(72)
    && evolutionChoices[0]?.querySelector(".evolution-choice__sprite")?.style.backgroundSize
      === homeBackgroundSizeFor(96),
  "Les sprites HOME de la fenêtre d’évolutions ne respectent pas leurs cadres de 72 et 96 px.");
  spriteModeButton.click();
  evolutionChoices = [...dom.window.document.querySelectorAll("#evolutionDialogGrid .evolution-choice")];
  check(evolutionChoices[0]?.querySelector(".evolution-choice__sprite")?.dataset.spriteMode === "2d",
    "Une fenêtre d’évolutions ouverte ne suit pas le retour au mode 2D.");
  let evolutionTargets = evolutionChoices.map(choice => choice.querySelector("strong")?.textContent);
  check(evolutionTargets.includes("Kadabra") && evolutionTargets.includes("Alakazam"),
    "Deux Abra mâles ne proposent pas Kadabra ou Alakazam manquants.");
  check(dom.window.document.getElementById("evolutionDialog").hasAttribute("open"),
    "Un clic sur le Pokémon évoluable n’ouvre pas sa fenêtre de possibilités.");
  check(dom.window.document.querySelector(".evolution-card__count")?.textContent.includes("1"),
    "La suggestion n’indique pas qu’un Abra restera dans la collection.");
  dom.window.document.getElementById("evolutionDialog").close();
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [abraMale.key]: 2, [kadabraMale.key]: 1 },
    preferences: synchronizedPreferences
  });
  evolutionChoices = openEvolutionChoices(abraMale.key);
  evolutionTargets = evolutionChoices.map(choice => choice.querySelector("strong")?.textContent);
  check(!evolutionTargets.includes("Kadabra") && evolutionTargets.includes("Alakazam"),
    "Kadabra déjà possédé doit disparaître des propositions tandis qu’Alakazam reste proposé.");
  dom.window.document.getElementById("evolutionDialog").close();

  const paldeanWooperMale = data.entries.find(entry =>
    entry.speciesId === 194
      && entry.gender === "male"
      && entry.formNames.en.toLowerCase().includes("paldea")
      && !entry.exceptional
  );
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [paldeanWooperMale.key]: 2 },
    preferences: synchronizedPreferences
  });
  evolutionChoices = openEvolutionChoices(paldeanWooperMale.key);
  evolutionTargets = evolutionChoices.map(choice => choice.querySelector("strong")?.textContent);
  check(evolutionTargets.includes("Terraiste") && !evolutionTargets.includes("Maraiste"),
    "Axoloto de Paldea doit proposer Terraiste sans proposer Maraiste.");
  dom.window.document.getElementById("evolutionDialog").close();

  const pichuMale = data.entries.find(entry =>
    entry.speciesId === 172 && entry.gender === "male" && entry.formId === 172
  );
  const spikyPichu = data.entries.find(entry => entry.speciesId === 172 && entry.formId === 10065);
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [pichuMale.key]: 2 },
    preferences: synchronizedPreferences
  });
  evolutionChoices = openEvolutionChoices(pichuMale.key);
  check(evolutionChoices.some(choice => choice.querySelector("strong")?.textContent === "Pikachu")
    && evolutionChoices.every(choice => !choice.querySelector("small")?.textContent.includes("Casquette")),
    "Pichu doit proposer Pikachu standard sans aucune forme à casquette.");
  dom.window.document.getElementById("evolutionDialog").close();
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [spikyPichu.key]: 2 },
    preferences: synchronizedPreferences
  });
  check(![...dom.window.document.querySelectorAll("#evolutionSuggestions .evolution-card")]
    .some(card => card.dataset.sourceKey === spikyPichu.key),
  "Pichu Troizépi ne doit proposer aucune évolution.");

  const redFlabebe = data.entries.find(entry =>
    entry.speciesId === 669 && entry.formNames.en === "Red Flower"
  );
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [redFlabebe.key]: 2 },
    preferences: synchronizedPreferences
  });
  evolutionChoices = openEvolutionChoices(redFlabebe.key);
  check(evolutionChoices.length === 2
    && evolutionChoices.every(choice => choice.querySelector("small")?.textContent.includes("Fleur Rouge")),
    "Flabébé Fleur Rouge doit uniquement proposer Floette et Florges Fleur Rouge.");
  dom.window.document.getElementById("evolutionDialog").close();

  const counterfeitPoltchageist = data.entries.find(entry =>
    entry.speciesId === 1012 && entry.formNames.en === "Counterfeit Form"
  );
  const artisanPoltchageist = data.entries.find(entry =>
    entry.speciesId === 1012 && entry.formNames.en === "Artisan Form"
  );
  for (const [source, expected, rejected] of [
    [counterfeitPoltchageist, "Forme Médiocre", "Forme Exceptionnelle"],
    [artisanPoltchageist, "Forme Exceptionnelle", "Forme Médiocre"]
  ]) {
    dom.window.SHINYDEX_APP.applySyncedState({
      schemaVersion: 2,
      collection: { [source.key]: 2 },
      preferences: synchronizedPreferences
    });
    evolutionChoices = openEvolutionChoices(source.key);
    const labels = evolutionChoices.map(choice => choice.querySelector("small")?.textContent || "");
    check(labels.length === 1 && labels[0].includes(expected) && !labels[0].includes(rejected),
      `${source.formNames.fr} doit uniquement évoluer vers ${expected}.`);
    dom.window.document.getElementById("evolutionDialog").close();
  }

  const milcery = data.entries.find(entry => entry.speciesId === 868 && !entry.exceptional);
  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: { [milcery.key]: 5 },
    preferences: synchronizedPreferences
  });
  check(dom.window.document.querySelectorAll("#evolutionSuggestions .evolution-card").length === 1,
    "Crèmy doit rester une seule fiche, quel que soit le nombre de formes de Charmilly.");
  evolutionChoices = openEvolutionChoices(milcery.key);
  check(evolutionChoices.length >= 60,
    "La fenêtre de Crèmy n’affiche pas toutes les formes compatibles de Charmilly.");
  dom.window.document.getElementById("evolutionDialog").close();

  dom.window.SHINYDEX_APP.applySyncedState({
    schemaVersion: 2,
    collection: {},
    preferences: synchronizedPreferences
  });
  const lineageSearch = dom.window.document.getElementById("searchInput");
  lineageSearch.value = "Salamèche";
  lineageSearch.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
  cardFor(4)?.querySelector(".pokemon-card__toggle")?.click();
  dom.window.document.getElementById("lineageButton").click();
  let lineageIds = [...dom.window.document.querySelectorAll(".pokemon-card")]
    .map(card => Number(card.dataset.speciesId));
  check(lineageIds.join(",") === "4,5,6"
    && dom.window.document.getElementById("activeFilterText").textContent.includes("lignée de Salamèche"),
    "Le bouton de Salamèche n’affiche pas uniquement toute sa lignée évolutive.");
  cardFor(6)?.querySelector(".pokemon-card__toggle")?.click();
  dom.window.document.getElementById("lineageButton").click();
  lineageIds = [...dom.window.document.querySelectorAll(".pokemon-card")]
    .map(card => Number(card.dataset.speciesId));
  check(lineageIds.join(",") === "4,5,6"
    && dom.window.document.getElementById("activeFilterText").textContent.includes("lignée de Dracaufeu"),
    "Le bouton de Dracaufeu ne remonte pas jusqu’à Salamèche.");
  dom.window.document.getElementById("clearFiltersButton").click();

  lineageSearch.value = "Pikachu";
  lineageSearch.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
  cardFor(25)?.querySelector(".pokemon-card__toggle")?.click();
  dom.window.document.getElementById("lineageButton").click();
  lineageIds = [...dom.window.document.querySelectorAll(".pokemon-card")]
    .map(card => Number(card.dataset.speciesId));
  check(lineageIds.join(",") === "172,25,26",
    "La lignée de Pikachu n’est pas affichée dans l’ordre Pichu → Pikachu → Raichu.");
  dom.window.document.getElementById("clearFiltersButton").click();

  const search = dom.window.document.getElementById("searchInput");
  search.value = "Poltchageist";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
  dom.window.document.querySelector(".pokemon-card__toggle")?.click();
  check(dom.window.document.querySelectorAll("#variantGrid .has-placeholder-sprite").length === 0,
    "Les sprites identiques des deux formes de Poltchageist sont encore marqués provisoires.");
  dom.window.document.getElementById("variantDialog").close();

  search.value = "Ogerpon";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
  dom.window.document.querySelector(".pokemon-card__toggle")?.click();
  let provisionalVariants = [...dom.window.document.querySelectorAll("#variantGrid .has-placeholder-sprite")];
  check(provisionalVariants.length === 0,
    "Les quatre téracristallisations d’Ogerpon sont encore provisoires en mode 2D.");
  spriteModeButton.click();
  provisionalVariants = [...dom.window.document.querySelectorAll("#variantGrid .has-placeholder-sprite")];
  check(provisionalVariants.length === 4
    && provisionalVariants.every(card => !card.querySelector(".sprite-placeholder-badge")?.hidden),
    "Les quatre rendus HOME provisoires d’Ogerpon n’affichent pas tous leur bandeau rouge.");
  spriteModeButton.click();
  dom.window.document.getElementById("variantDialog").close();

  search.value = "Zygarde";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
  dom.window.document.querySelector(".pokemon-card__toggle")?.click();
  let megaZygardeVariant = [...dom.window.document.querySelectorAll("#variantGrid .variant-option")]
    .find(card => card.querySelector(".variant-option__form")?.textContent === "Méga-Zygarde");
  check(megaZygardeVariant && !megaZygardeVariant.querySelector(".sprite-placeholder-badge")?.hidden,
    "Le bandeau provisoire de Méga-Zygarde est absent en mode 2D.");
  dom.window.document.getElementById("variantDialog").close();
  spriteModeButton.click();
  dom.window.document.querySelector(".pokemon-card__toggle")?.click();
  megaZygardeVariant = [...dom.window.document.querySelectorAll("#variantGrid .variant-option")]
    .find(card => card.querySelector(".variant-option__form")?.textContent === "Méga-Zygarde");
  check(megaZygardeVariant?.querySelector(".sprite-placeholder-badge")?.hidden,
    "Le bandeau 2D reste affiché alors que le rendu HOME exact de Méga-Zygarde est disponible.");
  dom.window.document.getElementById("variantDialog").close();
  spriteModeButton.click();

  search.value = "Zarbi";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
  check(dom.window.document.querySelectorAll(".pokemon-card").length === 1, "Les formes de Zarbi ne sont pas regroupées.");
  dom.window.document.querySelector(".pokemon-card__toggle").click();
  check(dom.window.document.querySelectorAll("#variantGrid .variant-option").length >= 28, "Les 28 formes de Zarbi ne sont pas proposées.");
  dom.window.document.getElementById("variantDialog").close();

  for (const [name, minimum] of [["Pikachu", 30], ["Charmilly", 60]]) {
    search.value = name;
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
    check(dom.window.document.querySelectorAll(".pokemon-card").length === 1,
      `Les nombreuses formes de ${name} ne sont pas regroupées.`);
    dom.window.document.querySelector(".pokemon-card__toggle").click();
    check(dom.window.document.querySelectorAll("#variantGrid .variant-option").length >= minimum,
      `Le sélecteur de ${name} n’affiche pas toutes ses formes sans compression.`);
    dom.window.document.getElementById("variantDialog").close();
  }

  const languageSelect = dom.window.document.getElementById("languageSelect");
  languageSelect.value = "en";
  languageSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  check(dom.window.document.documentElement.lang === "en", "Le changement de langue ne met pas à jour le document.");
  check(dom.window.document.getElementById("exportButton").textContent.includes("Export"), "L’interface anglaise n’est pas appliquée.");
  check(dom.window.SHINYDEX_APP.getState().preferences.language === "en", "La langue n’est pas sauvegardée.");
  check(dom.window.document.getElementById("languageFlag").getAttribute("src") === "assets/flags/en.svg", "Le drapeau ne suit pas la langue sélectionnée.");
  check(dom.window.document.getElementById("distributionTicker")?.textContent.includes("Shiny Volcanion"),
    "Le bandeau des distributions ne suit pas la langue sélectionnée.");
  const englishDistributionSources = [
    ...dom.window.document.querySelectorAll("#distributionGrid .distribution-card__source")
  ];
  check(englishDistributionSources.some(source => source.href.includes("pokemon.com/uk/news/")),
    "La source officielle anglaise n’est pas restaurée avec l’interface anglaise.");
  check(englishDistributionSources.every(source => source.hreflang === "en"),
    "La langue des liens officiels anglais n’est pas indiquée.");

  const coloredType = dom.window.document.querySelector(".type-pill");
  check(coloredType?.style.getPropertyValue("--type-color"), "Une bulle de type n’a pas sa couleur dédiée.");
  dom.window.close();
} catch (error) {
  errors.push(`Test fonctionnel du navigateur simulé impossible : ${error.message}`);
}

if (errors.length) {
  console.error(`Validation échouée (${errors.length}) :`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(
  `Validation réussie : ${data.speciesCount} fiches d’espèce, ${data.appearanceCount} variantes forme/sexe, `
  + `${languages.length} langues, `
  + `${(data.normalSheets.length + data.homeNormalSheets.length) * 2} planches locales, Firebase et PWA autonomes.`
);
