#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const [html, css, app, firebaseBundle, dataSource, serviceWorker, manifestSource, firestoreRules] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "styles.css"), "utf8"),
  readFile(resolve(root, "app.js"), "utf8"),
  readFile(resolve(root, "firebase-sync.js"), "utf8"),
  readFile(resolve(root, "data/pokedex-data.js"), "utf8"),
  readFile(resolve(root, "sw.js"), "utf8"),
  readFile(resolve(root, "manifest.webmanifest"), "utf8"),
  readFile(resolve(root, "firestore.rules"), "utf8")
]);

for (const [source, name] of [[app, "app.js"], [firebaseBundle, "firebase-sync.js"], [serviceWorker, "sw.js"]]) {
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

let manifest;
try {
  manifest = JSON.parse(manifestSource);
} catch (error) {
  errors.push(`Manifest invalide : ${error.message}`);
}

check(data?.schemaVersion === 1, "Version de schéma inattendue.");
check(data?.speciesCount >= 1025, "Les 1 025 espèces Pokémon ne sont pas toutes présentes.");
check(data?.entries?.length === data?.appearanceCount, "Le nombre d’apparences est incohérent.");
check(new Set(data?.entries?.map(entry => entry.speciesId)).size === data?.speciesCount, "Une espèce n’a aucune apparence.");
check(data?.entries?.some(entry => entry.name === "Zarbi" && entry.label === "B"), "Les formes de Zarbi sont incomplètes.");
check(data?.entries?.filter(entry => entry.name === "Zarbi").length >= 28, "Les 28 apparences de Zarbi sont absentes.");
check(data?.entries?.filter(entry => entry.name === "Vivaldaim").length >= 4, "Les quatre saisons de Vivaldaim sont absentes.");
check(data?.entries?.every(entry => entry.key && entry.name && Number.isInteger(entry.sheet)), "Une fiche Pokémon est invalide.");
check(new Set(data?.entries?.map(entry => entry.key)).size === data?.entries?.length, "Des identifiants d’apparence sont dupliqués.");
check(data?.normalSheets?.length === data?.shinySheets?.length, "Les planches normales et shiny ne correspondent pas.");
check(data?.normalSheets?.length > 0, "Aucune planche de sprites.");

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

for (const id of [
  "searchInput", "generationFilter", "typeFilter", "statusFilter", "sortSelect",
  "pokemonGrid", "ownedCount", "speciesCount", "copyCount", "resetDialog", "importInput",
  "accountButton", "authDialog", "authEmail", "authPassword", "signInButton",
  "createAccountButton", "syncNowButton", "signOutButton"
]) {
  check(html.includes(`id="${id}"`), `Élément #${id} absent.`);
}

check(html.includes("data/pokedex-data.js"), "La base locale n’est pas chargée.");
check(html.includes("manifest.webmanifest"), "Le manifeste PWA n’est pas relié.");
check(css.includes("content-visibility: auto"), "Le rendu différé des cartes n’est pas activé.");
check(app.includes("localStorage"), "La sauvegarde locale est absente.");
check(app.includes("requestIdleCallback"), "Le préchargement différé n’est pas configuré.");
check(app.includes("navigator.serviceWorker.register"), "Le mode hors ligne n’est pas activé.");
check(app.includes("window.SHINYDEX_APP"), "Le pont de synchronisation Firebase est absent.");
check(manifest?.display === "standalone", "Le manifeste ne permet pas l’installation.");
check(firebaseBundle.includes("pokemon-shinydex"), "La configuration Firebase attendue est absente.");
check(firebaseBundle.includes("users") && firebaseBundle.includes("shinydex"), "Le document Firebase Shinydex est absent.");
check(firestoreRules.includes("request.auth.uid == userId"), "Les règles Firestore ne protègent pas les données par utilisateur.");
check(serviceWorker.includes("firebase-sync.js"), "Le module Firebase local n’est pas mis en cache.");

const runtime = [html, css, app, firebaseBundle, dataSource, serviceWorker].join("\n").toLowerCase();
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
  dom.window.eval(dataSource);
  dom.window.eval(app);
  await new Promise(resolveDelay => setTimeout(resolveDelay, 40));

  const cards = dom.window.document.querySelectorAll(".pokemon-card");
  check(cards.length === data.appearanceCount, `Le rendu affiche ${cards.length} fiches au lieu de ${data.appearanceCount}.`);
  const firstCard = cards[0];
  const beforeSprite = firstCard.querySelector(".pokemon-sprite").style.backgroundImage;
  firstCard.querySelector(".pokemon-card__toggle").click();
  const afterSprite = firstCard.querySelector(".pokemon-sprite").style.backgroundImage;
  check(firstCard.classList.contains("is-owned"), "Un clic ne marque pas le Pokémon comme possédé.");
  check(beforeSprite !== afterSprite && afterSprite.includes("sprites-shiny"), "Un clic ne remplace pas le sprite normal par le shiny.");
  check(firstCard.querySelector(".quantity").querySelector("input").value === "1", "Le compteur shiny ne démarre pas à 1.");
  check(dom.window.localStorage.getItem("pokemonShinydex:v1"), "Le clic n’est pas sauvegardé dans localStorage.");
  check(typeof dom.window.SHINYDEX_APP?.getState === "function", "Le pont Firebase n’est pas exposé.");
  check(dom.window.SHINYDEX_APP.getState().collection[data.entries[0].key] === 1, "Le pont Firebase ne lit pas la collection.");

  const search = dom.window.document.getElementById("searchInput");
  search.value = "Zarbi";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 40));
  check(dom.window.document.querySelectorAll(".pokemon-card").length >= 28, "La recherche ne retrouve pas les formes de Zarbi.");
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
  `Validation réussie : ${data.speciesCount} espèces, ${data.appearanceCount} apparences, `
  + `${data.normalSheets.length * 2} planches locales, sauvegarde et PWA autonomes.`
);
