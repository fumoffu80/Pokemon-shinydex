#!/usr/bin/env node

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const distributionsPath = resolve(root, "data/distributions.js");
const localesPath = resolve(root, "data/distribution-source-locales.js");
const officialHosts = new Set([
  "www.pokemon.com",
  "pokemon.com",
  "legends.pokemon.com",
  "home.pokemon.com"
]);

export function parseTagAttributes(tag) {
  const attributes = {};
  const expression = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
  let match;
  while ((match = expression.exec(tag))) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

export function isOfficialPokemonUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && officialHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isFrenchUrl(value) {
  try {
    const url = new URL(value);
    return /\/(?:fr|fr-fr)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizeOfficialUrl(value, baseUrl) {
  try {
    const url = new URL(String(value).replace(/&amp;/gi, "&"), baseUrl);
    url.hash = "";
    if (url.protocol === "http:") url.protocol = "https:";
    return isOfficialPokemonUrl(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

export function extractFrenchAlternate(html, baseUrl) {
  const tags = String(html).match(/<(?:link|a)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = parseTagAttributes(tag);
    if (!/^fr(?:-|$)/i.test(attributes.hreflang || "") || !attributes.href) continue;
    const candidate = normalizeOfficialUrl(attributes.href, baseUrl);
    if (candidate && isFrenchUrl(candidate)) return candidate;
  }
  return null;
}

export function localizedPathCandidate(sourceUrl) {
  if (!isOfficialPokemonUrl(sourceUrl)) return null;
  const url = new URL(sourceUrl);
  const replacements = [
    ["/en-us/", "/fr-fr/"],
    ["/en-gb/", "/fr-fr/"],
    ["/uk/news/", "/fr/actualites/"],
    ["/us/news/", "/fr/actualites/"],
    ["/uk/", "/fr/"],
    ["/us/", "/fr/"]
  ];
  for (const [englishPath, frenchPath] of replacements) {
    if (!url.pathname.includes(englishPath)) continue;
    url.pathname = url.pathname.replace(englishPath, frenchPath);
    return url.href;
  }
  return null;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Pokemon-Shinydex-source-localizer/1.0 (+https://github.com/fumoffu80/Pokemon-shinydex)",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.6"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " pour " + url);
  return {
    html: await response.text(),
    url: response.url || url
  };
}

async function verifyFrenchPage(candidate) {
  if (!candidate || !isOfficialPokemonUrl(candidate) || !isFrenchUrl(candidate)) return null;
  const page = await fetchHtml(candidate);
  if (!isOfficialPokemonUrl(page.url) || !isFrenchUrl(page.url)) return null;
  const visibleHead = page.html.slice(0, 40000);
  if (/page (?:not found|introuvable)|erreur 404|>404</i.test(visibleHead)) return null;
  return normalizeOfficialUrl(page.url, candidate);
}

export async function resolveFrenchSource(sourceUrl) {
  if (!isOfficialPokemonUrl(sourceUrl)) return null;
  if (isFrenchUrl(sourceUrl)) return verifyFrenchPage(sourceUrl);

  let sourcePage;
  let sourceFailure;
  try {
    sourcePage = await fetchHtml(sourceUrl);
  } catch (error) {
    sourceFailure = error;
  }

  if (sourcePage) {
    const alternate = extractFrenchAlternate(sourcePage.html, sourcePage.url);
    if (alternate) {
      try {
        const verified = await verifyFrenchPage(alternate);
        if (verified) return verified;
      } catch {
        // Le chemin régional déterministe reste essayé ci-dessous.
      }
    }
  }

  const candidate = localizedPathCandidate(sourcePage?.url || sourceUrl);
  if (candidate) {
    try {
      const verified = await verifyFrenchPage(candidate);
      if (verified) return verified;
    } catch {
      // L’absence d’équivalent français ne doit pas casser la surveillance.
    }
  }

  if (sourceFailure) throw sourceFailure;
  return null;
}

async function readWindowFile(path, globalName) {
  const source = await readFile(path, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: path });
  return context.window[globalName];
}

function canonicalSourceFor(item) {
  return item?.sourceUrls?.en || item?.sourceUrl || null;
}

export function serializeSourceLocales(sources) {
  const entries = Object.entries(sources).sort(([left], [right]) => left.localeCompare(right));
  const lines = [
    "/* Sources officielles localisées, générées automatiquement par le workflow quotidien. */",
    "window.SHINYDEX_DISTRIBUTION_SOURCE_LOCALES = Object.freeze({",
    "  schemaVersion: 1,",
    "  sources: Object.freeze({"
  ];

  entries.forEach(([sourceUrl, localized], index) => {
    lines.push("    " + JSON.stringify(sourceUrl) + ": Object.freeze({");
    if (localized.fr) lines.push("      fr: " + JSON.stringify(localized.fr) + ",");
    lines.push("      en: " + JSON.stringify(localized.en || sourceUrl));
    lines.push("    })" + (index === entries.length - 1 ? "" : ","));
  });

  lines.push("  })", "});", "");
  return lines.join("\n");
}

async function writeOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(values).map(([key, value]) => key + "=" + String(value)).join("\n") + "\n",
    "utf8"
  );
}

export async function main() {
  const distributions = await readWindowFile(distributionsPath, "SHINYDEX_DISTRIBUTIONS");
  let previous = { schemaVersion: 1, sources: {} };
  try {
    previous = await readWindowFile(localesPath, "SHINYDEX_DISTRIBUTION_SOURCE_LOCALES");
  } catch {
    // Le premier passage crée le référentiel.
  }

  const sources = {};
  for (const item of distributions?.items || []) {
    const canonical = canonicalSourceFor(item);
    if (!canonical || !isOfficialPokemonUrl(canonical)) continue;
    sources[canonical] = {
      ...(previous?.sources?.[canonical] || {}),
      ...(item.sourceUrls || {}),
      en: canonical
    };
  }

  let resolved = 0;
  let failures = 0;
  for (const sourceUrl of Object.keys(sources)) {
    try {
      const frenchUrl = await resolveFrenchSource(sourceUrl);
      if (frenchUrl) {
        sources[sourceUrl].fr = frenchUrl;
        resolved += 1;
      }
    } catch (error) {
      failures += 1;
      console.warn("[source française] " + sourceUrl + " : " + (error?.message || error));
    }
  }

  const serialized = serializeSourceLocales(sources);
  let current = "";
  try {
    current = await readFile(localesPath, "utf8");
  } catch {
    // Le fichier sera créé.
  }
  const changed = current !== serialized;
  if (changed) await writeFile(localesPath, serialized, "utf8");

  const unresolved = Object.values(sources).filter(source => !source.fr).length;
  await writeOutputs({ changed, resolved, unresolved, failures });
  console.log(
    "Sources localisées : " + resolved
    + " résolue(s), " + unresolved
    + " sans équivalent français, " + failures
    + " échec(s), fichier " + (changed ? "actualisé." : "inchangé.")
  );
}

const invokedUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedUrl) {
  await main();
}
