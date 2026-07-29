#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import sharp from "sharp";

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
  readFile(resolve(root, "sw.js"), "utf8"),
  readFile(resolve(root, "manifest.webmanifest"), "utf8"),
  readFile(resolve(root, "firestore.rules"), "utf8")
]);

for (const [source, name] of [
  [i18nSource, "i18n.js"],
  [genderDifferencesSource, "gender-differences.js"],
  [app, "app.js"],
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
check(data?.speciesCount >= 1025, "Les 1 025 espèces Pokémon ne sont pas toutes présentes.");
check(data?.entries?.length === data?.appearanceCount, "Le nombre de variantes est incohérent.");
check(new Set(data?.entries?.map(entry => entry.speciesId)).size === data?.speciesCount, "Une espèce n’a aucune variante.");
check(data?.visualCount < data?.appearanceCount, "Les sprites identiques des deux sexes ne sont pas mutualisés.");
check(new Set(data?.entries?.map(entry => entry.key)).size === data?.entries?.length, "Des identifiants de variante sont dupliqués.");
check(data?.normalSheets?.length === data?.shinySheets?.length, "Les planches normales et shiny ne correspondent pas.");
check(data?.normalSheets?.length > 0, "Aucune planche de sprites.");
check(languages.every(language => data?.languages?.includes(language)), "Les six langues de données ne sont pas disponibles.");

const florizarre = data?.entries?.filter(entry => entry.speciesId === 3 && !entry.exceptional) || [];
const megaEntries = data?.entries?.filter(entry => entry.exceptionReason === "mega") || [];
const gigamaxEntries = data?.entries?.filter(entry => entry.exceptionReason === "gigamax") || [];
const visualCount = speciesId => new Set(
  data?.entries?.filter(entry => entry.speciesId === speciesId).map(entry => `${entry.sheet}:${entry.slot}`)
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
check(data?.entries?.find(entry => entry.speciesId === 888 && entry.formNames.fr === "Épée Suprême")?.exceptional,
  "La forme couronnée de Zacian doit être une exception.");
check(data?.entries?.filter(entry => entry.speciesId === 29).every(entry => entry.gender === "female"), "Nidoran♀ ne doit pas proposer de mâle.");
check(data?.entries?.filter(entry => entry.speciesId === 32).every(entry => entry.gender === "male"), "Nidoran♂ ne doit pas proposer de femelle.");
check(data?.entries?.filter(entry => entry.speciesId === 81).every(entry => entry.gender === "genderless"), "Magnéti doit rester asexué.");
check(data?.entries?.filter(entry => entry.speciesId === 201).length >= 28, "Les 28 formes de Zarbi sont absentes.");
check(data?.entries?.filter(entry => entry.speciesId === 585).length >= 8, "Les saisons et sexes de Vivaldaim sont incomplets.");
check(data?.entries?.every(entry =>
  entry.key
  && entry.names?.fr
  && languages.every(language => entry.names?.[language])
  && languages.every(language => typeof entry.formNames?.[language] === "string")
  && ["male", "female", "genderless"].includes(entry.gender)
  && typeof entry.exceptional === "boolean"
  && typeof entry.exceptionReason === "string"
  && (!entry.exceptional || ["mega", "gigamax", "fusion", "item", "temporary", "battle"].includes(entry.exceptionReason))
  && Number.isInteger(entry.visualVariantCount)
  && Number.isInteger(entry.sheet)
), "Une variante Pokémon est invalide ou mal traduite.");
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
  "authDialog", "authEmail", "authPassword", "signInButton", "createAccountButton",
  "syncNowButton", "signOutButton"
]) {
  check(html.includes(`id="${id}"`), `Élément #${id} absent.`);
}

check(html.includes("i18n.js"), "Le module multilingue n’est pas chargé.");
check(html.includes("gender-differences.js"), "Les descriptions des différences sexuelles ne sont pas chargées.");
check(html.includes("data/pokedex-data.js"), "La base locale n’est pas chargée.");
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
check(css.includes("minmax(min(100%, 174px), 1fr)"), "La grille Pokémon n’est pas fluide sur toutes les largeurs.");
check(css.includes("100vw - clamp(64px, 6vw, 220px)"), "La mise en page n’exploite pas les écrans ultralarges.");
check(css.includes("grid-auto-rows: var(--variant-card-height)"), "Les lignes du sélecteur peuvent encore comprimer les variantes.");
check(css.includes("min-height: var(--variant-card-height)"), "La hauteur minimale des cartes de variante n’est pas verrouillée.");
check(css.includes("align-content: start"), "La grille de variantes étire encore ses lignes pour remplir la fenêtre.");
check(css.includes("scrollbar-gutter: stable"), "Le défilement des nombreuses variantes n’est pas stabilisé.");
check(html.includes('class="stat-spark"'), "L’icône du total de shiny n’a pas été remplacée.");
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
check(app.includes("(ownedSpecies / DATA.speciesCount) * 100"), "La complétion n’est pas calculée sur les espèces.");
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
check(serviceWorker.includes("pokemon-shinydex-v5"), "Le cache PWA n’a pas été renouvelé.");
check(serviceWorker.includes("i18n.js") && serviceWorker.includes("gender-differences.js") && serviceWorker.includes("shiny-pokeball.svg"), "Les nouvelles ressources ne sont pas mises en cache.");
check(languages.every(language => serviceWorker.includes(`assets/flags/${language}.svg`)), "Les drapeaux ne sont pas tous disponibles hors ligne.");

const runtime = [html, css, i18nSource, genderDifferencesSource, app, firebaseBundle, dataSource, serviceWorker].join("\n").toLowerCase();
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
  dom.window.eval(app);
  await new Promise(resolveDelay => setTimeout(resolveDelay, 80));

  const cards = dom.window.document.querySelectorAll(".pokemon-card");
  check(cards.length === data.speciesCount, `Le rendu affiche ${cards.length} fiches au lieu d’une par espèce.`);
  check(dom.window.document.querySelectorAll('.pokemon-card[data-species-id="3"]').length === 1, "Florizarre apparaît sur plusieurs fiches.");

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

  const bulbizarrePosition = cardFor(1)?.querySelector(".pokemon-sprite")?.style.backgroundPosition;
  const rattataPosition = cardFor(19)?.querySelector(".pokemon-sprite")?.style.backgroundPosition;
  rotateCards?.();
  check(cardFor(1)?.querySelector(".pokemon-sprite")?.style.backgroundPosition === bulbizarrePosition, "Bulbizarre ne doit pas défiler entre deux sexes visuellement identiques.");
  check(cardFor(19)?.querySelector(".pokemon-sprite")?.style.backgroundPosition !== rattataPosition, "Le carrousel de Rattata ne parcourt pas ses trois apparences.");

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

  const firstVariant = dom.window.document.querySelector("#variantGrid .variant-option");
  const beforeSprite = firstVariant.querySelector(".variant-option__sprite").style.backgroundImage;
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

  const search = dom.window.document.getElementById("searchInput");
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
  + `${languages.length} langues, ${data.normalSheets.length * 2} planches locales, Firebase et PWA autonomes.`
);
