#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import process from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CHANGESET_DIR = join(REPO_ROOT, ".changeset");
const CHANGESET_CONFIG_PATH = join(CHANGESET_DIR, "config.json");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const VALID_BUMPS = new Set(["patch", "minor", "major"]);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function incrementVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version '${version}'. Expected x.y.z.`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

function sanitizeSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function readIgnoredPackageNames() {
  if (!existsSync(CHANGESET_CONFIG_PATH)) {
    return new Set();
  }

  const config = parseJsonFile(CHANGESET_CONFIG_PATH);
  return new Set(Array.isArray(config.ignore) ? config.ignore : []);
}

function getPublishablePackages() {
  const ignoredNames = readIgnoredPackageNames();
  const entries = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  return entries
    .map((directoryName) => {
      const packageJsonPath = join(PACKAGES_DIR, directoryName, "package.json");
      const pkg = parseJsonFile(packageJsonPath);
      return {
        directoryName,
        shortName: String(pkg.name).replace(/^@[^/]+\//, ""),
        name: String(pkg.name),
        version: String(pkg.version),
        private: Boolean(pkg.private),
      };
    })
    .filter((pkg) => !pkg.private && !ignoredNames.has(pkg.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    details: "",
    packages: "",
    summary: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--summary") {
      args.summary = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--details") {
      args.details = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--packages") {
      args.packages = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }

    fail(`Unknown argument '${token}'.`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  pnpm changeset
  pnpm changeset -- --dry-run
  pnpm changeset -- --packages "@agentrail/config:minor,@agentrail/sandbox:patch" --summary "..." [--details "..."]

Behavior:
  - Lists publishable packages from packages/*
  - Computes next version numbers from the selected bump types
  - Names the markdown file with package short names and next versions
  - Writes the changeset file into .changeset/
`);
}

function parsePackageSelection(input, packagesByName, packagesByShortName) {
  const selections = [];
  const seen = new Set();

  for (const rawToken of input.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;

    const [packageName, bump] = token.split(":").map((value) => value.trim());
    if (!VALID_BUMPS.has(bump)) {
      fail(`Invalid bump '${bump}' for '${packageName}'. Use patch, minor, or major.`);
    }

    const pkg = packagesByName.get(packageName) ?? packagesByShortName.get(packageName);
    if (!pkg) {
      fail(`Unknown package '${packageName}'.`);
    }

    if (seen.has(pkg.name)) {
      continue;
    }

    seen.add(pkg.name);
    selections.push({
      ...pkg,
      bump,
      nextVersion: incrementVersion(pkg.version, bump),
    });
  }

  if (selections.length === 0) {
    fail("No packages selected.");
  }

  return selections.sort((a, b) => a.name.localeCompare(b.name));
}

function createBaseFileName(selections) {
  const joined = selections
    .map((selection) => `${sanitizeSegment(selection.shortName)}-v${selection.nextVersion}`)
    .join("--");

  if (joined.length <= 120) {
    return joined;
  }

  const digest = createHash("sha1").update(joined).digest("hex").slice(0, 8);
  const prefix = joined.slice(0, 100).replace(/-+$/g, "");
  return `${prefix}--${digest}`;
}

function findAvailableFilePath(baseName) {
  const firstCandidate = join(CHANGESET_DIR, `${baseName}.md`);
  if (!existsSync(firstCandidate)) {
    return firstCandidate;
  }

  let suffix = 2;
  while (true) {
    const candidate = join(CHANGESET_DIR, `${baseName}-${suffix}.md`);
    if (!existsSync(candidate)) {
      return candidate;
    }
    suffix += 1;
  }
}

function renderChangesetContent(selections, summary, details) {
  const frontmatter = selections
    .map((selection) => `"${selection.name}": ${selection.bump}`)
    .join("\n");

  const bodyParts = [summary.trim()];
  if (details.trim()) {
    bodyParts.push(details.trim());
  }

  return `---\n${frontmatter}\n---\n\n${bodyParts.join("\n\n")}\n`;
}

async function promptForSelections(packages) {
  const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const packagesByShortName = new Map(packages.map((pkg) => [pkg.shortName, pkg]));
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("Publishable packages:");
    packages.forEach((pkg, index) => {
      console.log(`  ${index + 1}. ${pkg.name} (current ${pkg.version})`);
    });

    const rawSelection = (
      await rl.question("\nSelect packages by number, full name, or short name (comma separated): ")
    ).trim();

    if (!rawSelection) {
      fail("No packages selected.");
    }

    const chosenPackages = [];
    const seen = new Set();
    const tokens = rawSelection
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

    for (const token of tokens) {
      let pkg = null;

      if (/^\d+$/.test(token)) {
        const index = Number(token) - 1;
        pkg = packages[index] ?? null;
      } else {
        pkg = packagesByName.get(token) ?? packagesByShortName.get(token) ?? null;
      }

      if (!pkg) {
        fail(`Unknown package selection '${token}'.`);
      }

      if (seen.has(pkg.name)) {
        continue;
      }

      seen.add(pkg.name);
      chosenPackages.push(pkg);
    }

    const selections = [];
    for (const pkg of chosenPackages.sort((a, b) => a.name.localeCompare(b.name))) {
      const patchVersion = incrementVersion(pkg.version, "patch");
      const minorVersion = incrementVersion(pkg.version, "minor");
      const majorVersion = incrementVersion(pkg.version, "major");
      const answer =
        (
          await rl.question(
            `Bump for ${pkg.name} [patch|minor|major] (patch -> ${patchVersion}, minor -> ${minorVersion}, major -> ${majorVersion}) [patch]: `,
          )
        ).trim() || "patch";

      if (!VALID_BUMPS.has(answer)) {
        fail(`Invalid bump '${answer}' for '${pkg.name}'.`);
      }

      selections.push({
        ...pkg,
        bump: answer,
        nextVersion: incrementVersion(pkg.version, answer),
      });
    }

    const summary = (await rl.question("\nSummary line for the changeset: ")).trim();
    if (!summary) {
      fail("Summary cannot be empty.");
    }

    console.log("\nOptional extra details. Press Enter on an empty line to finish:");
    const detailLines = [];
    while (true) {
      const line = await rl.question("> ");
      if (!line.trim()) {
        break;
      }
      detailLines.push(line);
    }

    return {
      selections,
      summary,
      details: detailLines.join("\n"),
    };
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packages = getPublishablePackages();

  if (packages.length === 0) {
    fail("No publishable packages were found.");
  }

  let summary = args.summary;
  let details = args.details;
  let selections;

  if (args.packages) {
    const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
    const packagesByShortName = new Map(packages.map((pkg) => [pkg.shortName, pkg]));
    selections = parsePackageSelection(args.packages, packagesByName, packagesByShortName);
    if (!summary.trim()) {
      fail("When using --packages, you must also provide --summary.");
    }
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      fail("Interactive mode requires a TTY. Use --packages and --summary instead.");
    }

    const prompted = await promptForSelections(packages);
    selections = prompted.selections;
    summary = prompted.summary;
    details = prompted.details;
  }

  const baseName = createBaseFileName(selections);
  const filePath = findAvailableFilePath(baseName);
  const content = renderChangesetContent(selections, summary, details);

  if (args.dryRun) {
    console.log(`\n[dry-run] Would write ${filePath}\n`);
    console.log(content);
    return;
  }

  mkdirSync(CHANGESET_DIR, { recursive: true });
  writeFileSync(filePath, content, "utf8");

  console.log(`Created ${filePath}`);
  console.log(
    `Selected packages: ${selections.map((selection) => `${selection.name} -> ${selection.nextVersion}`).join(", ")}`,
  );
}

await main();
