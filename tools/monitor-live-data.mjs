#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const statePath = resolve(root, "data/source-monitor-state.json");
const reportPath = resolve(root, ".monitor-report.md");
const currentYear = new Date().getUTCFullYear();

const sources = [
  {
    id: "shiny-legality",
    label: "Légalité des Pokémon shiny",
    kind: "mediawiki",
    url: "https://bulbapedia.bulbagarden.net/w/api.php?action=query&prop=revisions&titles=List_of_unobtainable_Shiny_Pok%C3%A9mon&rvprop=ids%7Ctimestamp&format=json&origin=*"
  },
  {
    id: "official-distributions",
    label: "Distributions Pokémon officielles",
    kind: "visible-text",
    url: "https://www.pokemon.com/us/pokemon-video-games/pokemon-distributions"
  },
  {
    id: "pokemon-home-gifts",
    label: "Cadeaux Pokémon HOME",
    kind: "visible-text",
    url: "https://home.pokemon.com/en-us/move/"
  },
  {
    id: "event-database",
    label: "Base mondiale des événements",
    kind: "visible-text",
    url: "https://www.serebii.net/events/" + currentYear + ".shtml"
  }
];

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fingerprint(source) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Pokemon-Shinydex-source-monitor/1.0 (+https://github.com/fumoffu80/Pokemon-shinydex)",
      "Accept-Language": "en,fr;q=0.8"
    },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("HTTP " + response.status);

  if (source.kind === "mediawiki") {
    const payload = await response.json();
    const page = Object.values(payload?.query?.pages || {})[0];
    const revision = page?.revisions?.[0];
    if (!revision?.revid) throw new Error("révision MediaWiki introuvable");
    return {
      fingerprint: hash(String(revision.revid)),
      detail: "révision " + revision.revid + " du " + revision.timestamp
    };
  }

  const normalized = visibleText(await response.text());
  if (normalized.length < 80) throw new Error("contenu visible insuffisant");
  return {
    fingerprint: hash(normalized),
    detail: normalized.length + " caractères normalisés"
  };
}

let previous = { schemaVersion: 1, updatedAt: null, sources: {} };
try {
  previous = JSON.parse(await readFile(statePath, "utf8"));
} catch {
  // Le premier passage établit simplement la référence.
}

const observedAt = new Date().toISOString();
const next = {
  schemaVersion: 1,
  updatedAt: previous.updatedAt,
  sources: { ...(previous.sources || {}) }
};
const baselines = [];
const changes = [];
const failures = [];

for (const source of sources) {
  try {
    const result = await fingerprint(source);
    const prior = previous.sources?.[source.id];
    if (!prior?.fingerprint) {
      baselines.push(source);
    } else if (prior.fingerprint !== result.fingerprint) {
      changes.push({ source, prior, result });
    }
    next.sources[source.id] = {
      label: source.label,
      url: source.url,
      fingerprint: result.fingerprint,
      detail: result.detail,
      observedAt: !prior?.fingerprint || prior.fingerprint !== result.fingerprint
        ? observedAt
        : prior.observedAt
    };
  } catch (error) {
    failures.push({ source, message: error instanceof Error ? error.message : String(error) });
  }
}

if (baselines.length || changes.length) {
  next.updatedAt = observedAt;
  await writeFile(statePath, JSON.stringify(next, null, 2) + "\n", "utf8");
}

const report = [
  "# Surveillance quotidienne du Shinydex",
  "",
  "Contrôle : " + observedAt,
  "",
  changes.length ? "## Sources modifiées" : "## Sources modifiées\n\nAucune.",
  ...changes.flatMap(({ source, prior, result }) => [
    "",
    "- [" + source.label + "](" + source.url + ")",
    "  - ancienne empreinte : \x60" + prior.fingerprint.slice(0, 12) + "\x60",
    "  - nouvelle empreinte : \x60" + result.fingerprint.slice(0, 12) + "\x60"
  ]),
  "",
  failures.length ? "## Sources inaccessibles" : "## Sources inaccessibles\n\nAucune.",
  ...failures.map(({ source, message }) => "- [" + source.label + "](" + source.url + ") : " + message),
  "",
  baselines.length ? "Références initialisées : " + baselines.map(source => source.label).join(", ") + "." : ""
].join("\n");

await writeFile(reportPath, report + "\n", "utf8");

const alert = changes.length > 0 || failures.length > 0;
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, [
    "alert=" + String(alert),
    "changed=" + String(changes.length > 0),
    "baseline=" + String(baselines.length > 0),
    "failures=" + String(failures.length > 0)
  ].join("\n") + "\n", "utf8");
}

console.log(report);
