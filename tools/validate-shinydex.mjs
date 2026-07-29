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
  app,
  firebaseBundle,
  dataSource,
  serviceWorker,
  manifestSource,
  firestoreRules
] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "styles.css"), "utf8"),
  readFile(resolve(root, "i18n.js"), "utf8"),
  readFile(resolve(root, "app.js"), "utf8"),
  readFile(resolve(root, "firebase-sync.js"), "utf8"),
  readFile(resolve(root, "data/pokedex-data.js"), "utf8"),
  readFile(resolve(root, "sw.js"), "utf8"),
  readFile(resolve(root, "manifest.webmanifest"), "utf8"),
  readFile(resolve(root, "firestore.rules"), "utf8")
]);

for (const [source, name] of [
  [i18nSource, "i18n.js"],
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

const florizarre = data?.entries?.filter(entry => entry.speciesId === 3) || [];
const visualCount = speciesId => new Set(
  data?.entries?.filter(entry => entry.speciesId === speciesId).map(entry => `${entry.sheet}:${entry.slot}`)
).size;
check(florizarre.length === 2, "Florizarre doit proposer exactement un mâle et une femelle.");
check(new Set(florizarre.map(entry => entry.gender)).size === 2, "Les deux sexes de Florizarre sont incomplets.");
check(visualCount(1) === 1, "Bulbizarre ne doit avoir qu’une apparence malgré ses deux sexes.");
check(visualCount(2) === 1, "Herbizarre ne doit avoir qu’une apparence malgré ses deux sexes.");
check(visualCount(3) === 2, "Florizarre doit avoir deux apparences mâle/femelle.");
check(visualCount(19) === 3, "Rattata doit avoir trois apparences : deux de Kanto et une d’Alola.");
check(visualCount(58) === 2, "Caninos doit avoir deux apparences régionales, pas quatre variantes de sexe.");
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
  "variantGrid", "variantCardTemplate", "resetDialog", "importInput", "accountButton",
  "authDialog", "authEmail", "authPassword", "signInButton", "createAccountButton",
  "syncNowButton", "signOutButton"
]) {
  check(html.includes(`id="${id}"`), `Élément #${id} absent.`);
}

check(html.includes("i18n.js"), "Le module multilingue n’est pas chargé.");
check(html.includes("data/pokedex-data.js"), "La base locale n’est pas chargée.");
check(html.includes("assets/shiny-pokeball.svg"), "Le favicon Poké Ball shiny n’est pas relié.");
check(languages.every(language => i18nSource.includes(`assets/flags/${language}.svg`)), "Les six drapeaux de langue ne sont pas configurés.");
check(html.includes("manifest.webmanifest"), "Le manifeste PWA n’est pas relié.");
check(!/compact|densityButton|is-compact/i.test(`${html}\n${app}\n${css}`), "Le mode compact n’a pas été entièrement supprimé.");
check(!html.toLowerCase().includes("cliquer pour marquer"), "La consigne répétée est encore présente dans les fiches.");
check(html.includes('data-i18n="instruction"'), "La consigne générale au-dessus du Pokédex est absente.");
check(css.includes("content-visibility: auto"), "Le rendu différé des cartes n’est pas activé.");
check(css.includes("--type-color"), "Les couleurs propres aux types sont absentes.");
check(/\.language-control select option\s*\{[^}]*background:\s*var\(--surface-raised\)/s.test(css), "Le menu des langues n’utilise pas les couleurs sombres du site.");
check(css.includes("minmax(min(100%, 174px), 1fr)"), "La grille Pokémon n’est pas fluide sur toutes les largeurs.");
check(app.includes("HOVER_DELAY = 2000"), "L’ouverture après deux secondes de survol n’est pas configurée.");
check(app.includes("setInterval(rotateVisibleVariants"), "Le défilement automatique des variantes est absent.");
check(app.includes("% group.visuals.length"), "Le carrousel n’est pas limité aux apparences visuellement différentes.");
check(app.includes("localStorage"), "La sauvegarde locale est absente.");
check(app.includes("requestIdleCallback"), "Le préchargement différé n’est pas configuré.");
check(app.includes("navigator.serviceWorker.register"), "Le mode hors ligne n’est pas activé.");
check(app.includes("window.SHINYDEX_APP"), "Le pont de synchronisation Firebase est absent.");
check(manifest?.display === "standalone", "Le manifeste ne permet pas l’installation.");
check(manifest?.icons?.some(icon => icon.src === "assets/shiny-pokeball-192.png"), "L’icône Poké Ball 192 px est absente du manifeste.");
check(manifest?.icons?.some(icon => icon.src === "assets/shiny-pokeball-512.png"), "L’icône Poké Ball 512 px est absente du manifeste.");
check(firebaseBundle.includes("pokemon-shinydex"), "La configuration Firebase attendue est absente.");
check(firebaseBundle.includes("users") && firebaseBundle.includes("shinydex"), "Le document Firebase Shinydex est absent.");
check(firestoreRules.includes("request.auth.uid == userId"), "Les règles Firestore ne protègent pas les données par utilisateur.");
check(firestoreRules.includes("match /users/{userId}/apps/shinydex"), "Les règles Firestore ne ciblent pas uniquement le document Shinydex.");
check(serviceWorker.includes("i18n.js") && serviceWorker.includes("shiny-pokeball.svg"), "Les nouvelles ressources ne sont pas mises en cache.");
check(languages.every(language => serviceWorker.includes(`assets/flags/${language}.svg`)), "Les drapeaux ne sont pas tous disponibles hors ligne.");

const runtime = [html, css, i18nSource, app, firebaseBundle, dataSource, serviceWorker].join("\n").toLowerCase();
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
  check(badgeCount(3) === 2, "Le badge de Florizarre doit indiquer 2.");
  check(badgeCount(19) === 3, "Le badge de Rattata doit indiquer 3.");
  check(badgeCount(58) === 2, "Le badge de Caninos doit indiquer 2.");
  check(cardFor(1)?.querySelector(".pokemon-card__form")?.textContent === "Mâle / Femelle", "Bulbizarre doit afficher Mâle / Femelle sans alterner.");

  const bulbizarrePosition = cardFor(1)?.querySelector(".pokemon-sprite")?.style.backgroundPosition;
  const rattataPosition = cardFor(19)?.querySelector(".pokemon-sprite")?.style.backgroundPosition;
  rotateCards?.();
  check(cardFor(1)?.querySelector(".pokemon-sprite")?.style.backgroundPosition === bulbizarrePosition, "Bulbizarre ne doit pas défiler entre deux sexes visuellement identiques.");
  check(cardFor(19)?.querySelector(".pokemon-sprite")?.style.backgroundPosition !== rattataPosition, "Le carrousel de Rattata ne parcourt pas ses trois apparences.");

  const florizarreCard = dom.window.document.querySelector('.pokemon-card[data-species-id="3"]');
  florizarreCard.querySelector(".pokemon-card__toggle").click();
  check(dom.window.document.getElementById("variantDialog").hasAttribute("open"), "Un clic sur une espèce à variantes n’ouvre pas le sélecteur.");
  check(dom.window.document.querySelectorAll("#variantGrid .variant-option").length === 2, "Le sélecteur de Florizarre ne propose pas les deux sexes.");

  const firstVariant = dom.window.document.querySelector("#variantGrid .variant-option");
  const beforeSprite = firstVariant.querySelector(".variant-option__sprite").style.backgroundImage;
  firstVariant.querySelector(".variant-option__toggle").click();
  const refreshedVariant = dom.window.document.querySelector("#variantGrid .variant-option");
  const afterSprite = refreshedVariant.querySelector(".variant-option__sprite").style.backgroundImage;
  check(refreshedVariant.classList.contains("is-owned"), "Le clic ne marque pas la variante comme possédée.");
  check(beforeSprite !== afterSprite && afterSprite.includes("sprites-shiny"), "Le sprite normal n’est pas remplacé par le shiny.");
  check(refreshedVariant.querySelector(".quantity__input").value === "1", "Le compteur shiny ne démarre pas à 1.");
  check(dom.window.localStorage.getItem("pokemonShinydex:v1"), "Le clic n’est pas sauvegardé dans localStorage.");
  check(typeof dom.window.SHINYDEX_APP?.getState === "function", "Le pont Firebase n’est pas exposé.");
  check(dom.window.SHINYDEX_APP.getState().collection[florizarre[0].key] === 1, "Le pont Firebase ne lit pas la nouvelle collection.");

  dom.window.document.getElementById("variantDialog").close();
  const search = dom.window.document.getElementById("searchInput");
  search.value = "Zarbi";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
  check(dom.window.document.querySelectorAll(".pokemon-card").length === 1, "Les formes de Zarbi ne sont pas regroupées.");
  dom.window.document.querySelector(".pokemon-card__toggle").click();
  check(dom.window.document.querySelectorAll("#variantGrid .variant-option").length >= 28, "Les 28 formes de Zarbi ne sont pas proposées.");

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
