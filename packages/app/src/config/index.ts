/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument } from "yaml";

/** Current on-disk Agentrail config schema version. */
export const AGENTRAIL_CONFIG_VERSION = 1 as const;
/** Default project-relative config path used when no override is supplied. */
export const DEFAULT_CONFIG_RELATIVE_PATH = path.join("config", "agentrail.yaml");
/** Environment variable that overrides config file discovery. */
export const CONFIG_PATH_OVERRIDE_ENV_VAR = "AGENTRAIL_CONFIG_PATH";
/** Default root data directory for local Agentrail state. */
export const DEFAULT_DATA_DIR = path.join(os.homedir(), ".agentrail");
/** Default sandbox image used by local apps. */
export const DEFAULT_SANDBOX_IMAGE = "ghcr.io/yai-dev/agentrail-sandbox:latest";

type UnknownRecord = Record<string, unknown>;

/** Raw permissions block from `agentrail.yaml`. */
export interface AgentrailPermissionsConfig {
  /**
   * Permission mode controlling how `ask` decisions are handled.
   * Defaults to `"default"` when absent.
   */
  mode?: "default" | "acceptEdits" | "bypassPermissions" | "dontAsk";
  /** Rule strings that unconditionally allow matching tool calls, e.g. `"Bash(git:*)"`. */
  allow?: string[];
  /** Rule strings that unconditionally deny matching tool calls, e.g. `"Bash(rm:*)"`. */
  deny?: string[];
  /** Rule strings that require user confirmation, e.g. `"Write"`. */
  ask?: string[];
}

/** Full validated YAML config schema used by Agentrail apps and examples. */
export interface AgentrailConfig {
  version: 1;
  llm: {
    provider: string;
    modelId: string;
    baseUrl: string;
  };
  search: {
    provider: string;
    tavilyApiKey: string;
    braveApiKey: string;
    jinaApiKey: string;
  };
  paths: {
    dataDir: string;
  };
  auth: {
    uiSecretToken: string;
  };
  sandbox: {
    image: string;
    idleTimeoutMs: number;
  };
  orchestration: {
    subagent: {
      pollIntervalMs: number;
      fakeExecution: "" | "echo";
    };
  };
  apps: {
    playgroundServer: {
      port: number;
      compaction: {
        triggerTokens: number;
        minMessages: number;
        reactive: {
          enabled: boolean;
          microTriggerPct: number;
          fullTriggerPct: number;
          preserveRecentApiRounds: number;
          microBatchGroups: number;
          maxReactiveCompactionsPerRequest: number;
        };
      };
      userMemory: {
        enabled: boolean;
        idleMinutes: number;
        scanIntervalMinutes: number;
        minIntervalHours: number;
        minChangedSessions: number;
      };
      userPreferenceSummary: {
        enabled: boolean;
        minSessions: number;
        cooldownHours: number;
        maxSessionsToRead: number;
        maxMessagesPerRun: number;
      };
      skills: {
        delegateToSubAgent: boolean;
      };
    };
    deepResearch: {
      port: number;
    };
    playgroundUi: {
      port: number;
      backendPort: number;
    };
  };
  /** Optional permission policy applied to all sessions served by this app. */
  permissions?: AgentrailPermissionsConfig;
}

/** Options for resolving the Agentrail config path. */
export interface ResolveAgentrailConfigPathOptions {
  configPath?: string;
  cwd?: string;
}

/** Options for loading and parsing the Agentrail config file. */
export interface LoadAgentrailConfigOptions extends ResolveAgentrailConfigPathOptions {}

/** Resolved sandbox runtime settings consumed by applications. */
export interface SandboxRuntimeConfig {
  image: string;
  idleTimeoutMs: number;
}

/** Resolved sub-agent runtime settings consumed by orchestration layers. */
export interface SubagentRuntimeConfig {
  pollIntervalMs: number;
  fakeExecution: "" | "echo";
}

/** Shared resolved settings inherited by multiple local apps. */
export interface SharedResolvedAppConfig {
  provider: string;
  modelId: string;
  baseUrl?: string;
  searchProvider: string;
  tavilyApiKey?: string;
  braveApiKey?: string;
  jinaApiKey?: string;
  dataDir: string;
  uiSecretToken?: string;
  sandbox: SandboxRuntimeConfig;
  orchestration: {
    subagent: SubagentRuntimeConfig;
  };
}

/** Resolved config consumed by the playground server example. */
export interface PlaygroundServerConfig extends SharedResolvedAppConfig {
  port: number;
  compaction: AgentrailConfig["apps"]["playgroundServer"]["compaction"];
  userMemory: AgentrailConfig["apps"]["playgroundServer"]["userMemory"];
  userPreferenceSummary: AgentrailConfig["apps"]["playgroundServer"]["userPreferenceSummary"];
  skillDelegateToSubAgent: boolean;
}

/** Resolved config consumed by the deep research example app. */
export interface DeepResearchConfig extends SharedResolvedAppConfig {
  port: number;
}

/** Resolved config consumed by the playground UI app. */
export interface PlaygroundUiConfig {
  port: number;
  backendPort: number;
}

/** Default config values applied before user overrides are parsed. */
export const DEFAULT_AGENTRAIL_CONFIG: AgentrailConfig = {
  version: AGENTRAIL_CONFIG_VERSION,
  llm: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
    baseUrl: "",
  },
  search: {
    provider: "tavily",
    tavilyApiKey: "",
    braveApiKey: "",
    jinaApiKey: "",
  },
  paths: {
    dataDir: DEFAULT_DATA_DIR,
  },
  auth: {
    uiSecretToken: "",
  },
  sandbox: {
    image: DEFAULT_SANDBOX_IMAGE,
    idleTimeoutMs: 30 * 60 * 1000,
  },
  orchestration: {
    subagent: {
      pollIntervalMs: 500,
      fakeExecution: "",
    },
  },
  apps: {
    playgroundServer: {
      port: 3000,
      compaction: {
        triggerTokens: 60_000,
        minMessages: 6,
        reactive: {
          enabled: true,
          microTriggerPct: 85,
          fullTriggerPct: 92,
          preserveRecentApiRounds: 2,
          microBatchGroups: 2,
          maxReactiveCompactionsPerRequest: 3,
        },
      },
      userMemory: {
        enabled: true,
        idleMinutes: 10,
        scanIntervalMinutes: 1,
        minIntervalHours: 24,
        minChangedSessions: 5,
      },
      userPreferenceSummary: {
        enabled: true,
        minSessions: 2,
        cooldownHours: 24,
        maxSessionsToRead: 10,
        maxMessagesPerRun: 200,
      },
      skills: {
        delegateToSubAgent: true,
      },
    },
    deepResearch: {
      port: 3200,
    },
    playgroundUi: {
      port: 5173,
      backendPort: 3000,
    },
  },
};

function formatConfigPath(parts: string[]): string {
  return parts.length === 0 ? "config" : parts.join(".");
}

function assertObject(value: unknown, parts: string[]): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${formatConfigPath(parts)} to be an object.`);
  }
  return value as UnknownRecord;
}

function assertNoUnknownKeys(value: UnknownRecord, allowedKeys: string[], parts: string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown configuration field '${formatConfigPath([...parts, key])}'.`);
    }
  }
}

function getObject(
  parent: UnknownRecord,
  key: string,
  parts: string[],
  defaultValue: UnknownRecord,
): UnknownRecord {
  const raw = parent[key];
  if (raw === undefined) return defaultValue;
  return assertObject(raw, [...parts, key]);
}

function getString(
  parent: UnknownRecord,
  key: string,
  parts: string[],
  defaultValue: string,
): string {
  const raw = parent[key];
  if (raw === undefined) return defaultValue;
  if (typeof raw !== "string") {
    throw new Error(`Expected ${formatConfigPath([...parts, key])} to be a string.`);
  }
  return raw;
}

function getBoolean(
  parent: UnknownRecord,
  key: string,
  parts: string[],
  defaultValue: boolean,
): boolean {
  const raw = parent[key];
  if (raw === undefined) return defaultValue;
  if (typeof raw !== "boolean") {
    throw new Error(`Expected ${formatConfigPath([...parts, key])} to be a boolean.`);
  }
  return raw;
}

function getInteger(
  parent: UnknownRecord,
  key: string,
  parts: string[],
  defaultValue: number,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = parent[key];
  if (raw === undefined) return defaultValue;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new Error(`Expected ${formatConfigPath([...parts, key])} to be an integer.`);
  }
  if (raw < minimum || raw > maximum) {
    throw new Error(
      `Expected ${formatConfigPath([...parts, key])} to be between ${minimum} and ${maximum}.`,
    );
  }
  return raw;
}

function getStringArray(parent: UnknownRecord, key: string, parts: string[]): string[] {
  const raw = parent[key];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`Expected ${formatConfigPath([...parts, key])} to be an array.`);
  }
  return raw.map((item, i) => {
    if (typeof item !== "string") {
      throw new Error(`Expected ${formatConfigPath([...parts, key, String(i)])} to be a string.`);
    }
    return item;
  });
}

function getVersion(parent: UnknownRecord): 1 {
  const raw = parent.version;
  if (raw === undefined) return AGENTRAIL_CONFIG_VERSION;
  if (raw !== AGENTRAIL_CONFIG_VERSION) {
    throw new Error(`Expected version to be ${AGENTRAIL_CONFIG_VERSION}.`);
  }
  return AGENTRAIL_CONFIG_VERSION;
}

function normalizeOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function expandHomeDir(inputPath: string): string {
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function requireFile(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Agentrail config file not found at ${resolvedPath}.`);
  }
  return resolvedPath;
}

/** Resolves the config file path using explicit options, env override, then upward discovery. */
export function resolveAgentrailConfigPath(
  options: ResolveAgentrailConfigPathOptions = {},
): string {
  if (options.configPath) return requireFile(options.configPath);

  const envOverride = process.env[CONFIG_PATH_OVERRIDE_ENV_VAR];
  if (envOverride) return requireFile(envOverride);

  let currentDir = path.resolve(options.cwd ?? process.cwd());
  while (true) {
    const candidate = path.join(currentDir, DEFAULT_CONFIG_RELATIVE_PATH);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      throw new Error(
        `Unable to find ${DEFAULT_CONFIG_RELATIVE_PATH} from ${options.cwd ?? process.cwd()}.`,
      );
    }
    currentDir = parent;
  }
}

/** Parses raw YAML data into a validated `AgentrailConfig` object. */
export function parseAgentrailConfig(raw: unknown): AgentrailConfig {
  const root = assertObject(raw, []);
  assertNoUnknownKeys(
    root,
    [
      "version",
      "llm",
      "search",
      "paths",
      "auth",
      "sandbox",
      "orchestration",
      "apps",
      "permissions",
    ],
    [],
  );

  const llm = getObject(root, "llm", [], DEFAULT_AGENTRAIL_CONFIG.llm as UnknownRecord);
  assertNoUnknownKeys(llm, ["provider", "modelId", "baseUrl"], ["llm"]);

  const search = getObject(root, "search", [], DEFAULT_AGENTRAIL_CONFIG.search as UnknownRecord);
  assertNoUnknownKeys(
    search,
    ["provider", "tavilyApiKey", "braveApiKey", "jinaApiKey"],
    ["search"],
  );

  const pathsValue = getObject(root, "paths", [], DEFAULT_AGENTRAIL_CONFIG.paths as UnknownRecord);
  assertNoUnknownKeys(pathsValue, ["dataDir"], ["paths"]);

  const auth = getObject(root, "auth", [], DEFAULT_AGENTRAIL_CONFIG.auth as UnknownRecord);
  assertNoUnknownKeys(auth, ["uiSecretToken"], ["auth"]);

  const sandbox = getObject(root, "sandbox", [], DEFAULT_AGENTRAIL_CONFIG.sandbox as UnknownRecord);
  assertNoUnknownKeys(sandbox, ["image", "idleTimeoutMs"], ["sandbox"]);

  const orchestration = getObject(
    root,
    "orchestration",
    [],
    DEFAULT_AGENTRAIL_CONFIG.orchestration as UnknownRecord,
  );
  assertNoUnknownKeys(orchestration, ["subagent"], ["orchestration"]);
  const subagent = getObject(
    orchestration,
    "subagent",
    ["orchestration"],
    DEFAULT_AGENTRAIL_CONFIG.orchestration.subagent as UnknownRecord,
  );
  assertNoUnknownKeys(subagent, ["pollIntervalMs", "fakeExecution"], ["orchestration", "subagent"]);

  const apps = getObject(root, "apps", [], DEFAULT_AGENTRAIL_CONFIG.apps as UnknownRecord);
  assertNoUnknownKeys(apps, ["playgroundServer", "deepResearch", "playgroundUi"], ["apps"]);

  const playgroundServer = getObject(
    apps,
    "playgroundServer",
    ["apps"],
    DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer as UnknownRecord,
  );
  assertNoUnknownKeys(
    playgroundServer,
    ["port", "compaction", "userMemory", "userPreferenceSummary", "skills"],
    ["apps", "playgroundServer"],
  );
  const compaction = getObject(
    playgroundServer,
    "compaction",
    ["apps", "playgroundServer"],
    DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction as UnknownRecord,
  );
  assertNoUnknownKeys(
    compaction,
    ["triggerTokens", "minMessages", "reactive"],
    ["apps", "playgroundServer", "compaction"],
  );
  const reactiveCompaction = getObject(
    compaction,
    "reactive",
    ["apps", "playgroundServer", "compaction"],
    DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.reactive as UnknownRecord,
  );
  assertNoUnknownKeys(
    reactiveCompaction,
    [
      "enabled",
      "microTriggerPct",
      "fullTriggerPct",
      "preserveRecentApiRounds",
      "microBatchGroups",
      "maxReactiveCompactionsPerRequest",
    ],
    ["apps", "playgroundServer", "compaction", "reactive"],
  );
  const userMemory = getObject(
    playgroundServer,
    "userMemory",
    ["apps", "playgroundServer"],
    DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userMemory as UnknownRecord,
  );
  assertNoUnknownKeys(
    userMemory,
    ["enabled", "idleMinutes", "scanIntervalMinutes", "minIntervalHours", "minChangedSessions"],
    ["apps", "playgroundServer", "userMemory"],
  );
  const userPreferenceSummary = getObject(
    playgroundServer,
    "userPreferenceSummary",
    ["apps", "playgroundServer"],
    DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userPreferenceSummary as UnknownRecord,
  );
  assertNoUnknownKeys(
    userPreferenceSummary,
    ["enabled", "minSessions", "cooldownHours", "maxSessionsToRead", "maxMessagesPerRun"],
    ["apps", "playgroundServer", "userPreferenceSummary"],
  );
  const skills = getObject(
    playgroundServer,
    "skills",
    ["apps", "playgroundServer"],
    DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.skills as UnknownRecord,
  );
  assertNoUnknownKeys(skills, ["delegateToSubAgent"], ["apps", "playgroundServer", "skills"]);

  const deepResearch = getObject(
    apps,
    "deepResearch",
    ["apps"],
    DEFAULT_AGENTRAIL_CONFIG.apps.deepResearch as UnknownRecord,
  );
  assertNoUnknownKeys(deepResearch, ["port"], ["apps", "deepResearch"]);

  const playgroundUi = getObject(
    apps,
    "playgroundUi",
    ["apps"],
    DEFAULT_AGENTRAIL_CONFIG.apps.playgroundUi as UnknownRecord,
  );
  assertNoUnknownKeys(playgroundUi, ["port", "backendPort"], ["apps", "playgroundUi"]);

  const fakeExecution = getString(
    subagent,
    "fakeExecution",
    ["orchestration", "subagent"],
    DEFAULT_AGENTRAIL_CONFIG.orchestration.subagent.fakeExecution,
  );
  if (fakeExecution !== "" && fakeExecution !== "echo") {
    throw new Error(`Expected orchestration.subagent.fakeExecution to be "" or "echo".`);
  }

  return {
    version: getVersion(root),
    llm: {
      provider: getString(llm, "provider", ["llm"], DEFAULT_AGENTRAIL_CONFIG.llm.provider),
      modelId: getString(llm, "modelId", ["llm"], DEFAULT_AGENTRAIL_CONFIG.llm.modelId),
      baseUrl: getString(llm, "baseUrl", ["llm"], DEFAULT_AGENTRAIL_CONFIG.llm.baseUrl),
    },
    search: {
      provider: getString(search, "provider", ["search"], DEFAULT_AGENTRAIL_CONFIG.search.provider),
      tavilyApiKey: getString(
        search,
        "tavilyApiKey",
        ["search"],
        DEFAULT_AGENTRAIL_CONFIG.search.tavilyApiKey,
      ),
      braveApiKey: getString(
        search,
        "braveApiKey",
        ["search"],
        DEFAULT_AGENTRAIL_CONFIG.search.braveApiKey,
      ),
      jinaApiKey: getString(
        search,
        "jinaApiKey",
        ["search"],
        DEFAULT_AGENTRAIL_CONFIG.search.jinaApiKey,
      ),
    },
    paths: {
      dataDir: path.resolve(
        expandHomeDir(
          getString(pathsValue, "dataDir", ["paths"], DEFAULT_AGENTRAIL_CONFIG.paths.dataDir),
        ),
      ),
    },
    auth: {
      uiSecretToken: getString(
        auth,
        "uiSecretToken",
        ["auth"],
        DEFAULT_AGENTRAIL_CONFIG.auth.uiSecretToken,
      ),
    },
    sandbox: {
      image: getString(sandbox, "image", ["sandbox"], DEFAULT_AGENTRAIL_CONFIG.sandbox.image),
      idleTimeoutMs: getInteger(
        sandbox,
        "idleTimeoutMs",
        ["sandbox"],
        DEFAULT_AGENTRAIL_CONFIG.sandbox.idleTimeoutMs,
        1,
      ),
    },
    orchestration: {
      subagent: {
        pollIntervalMs: getInteger(
          subagent,
          "pollIntervalMs",
          ["orchestration", "subagent"],
          DEFAULT_AGENTRAIL_CONFIG.orchestration.subagent.pollIntervalMs,
          1,
        ),
        fakeExecution: fakeExecution as "" | "echo",
      },
    },
    apps: {
      playgroundServer: {
        port: getInteger(
          playgroundServer,
          "port",
          ["apps", "playgroundServer"],
          DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.port,
          1,
          65535,
        ),
        compaction: {
          triggerTokens: getInteger(
            compaction,
            "triggerTokens",
            ["apps", "playgroundServer", "compaction"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.triggerTokens,
            1,
          ),
          minMessages: getInteger(
            compaction,
            "minMessages",
            ["apps", "playgroundServer", "compaction"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.minMessages,
            0,
          ),
          reactive: {
            enabled: getBoolean(
              reactiveCompaction,
              "enabled",
              ["apps", "playgroundServer", "compaction", "reactive"],
              DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.reactive.enabled,
            ),
            microTriggerPct: getInteger(
              reactiveCompaction,
              "microTriggerPct",
              ["apps", "playgroundServer", "compaction", "reactive"],
              DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.reactive.microTriggerPct,
              1,
              100,
            ),
            fullTriggerPct: getInteger(
              reactiveCompaction,
              "fullTriggerPct",
              ["apps", "playgroundServer", "compaction", "reactive"],
              DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.reactive.fullTriggerPct,
              1,
              100,
            ),
            preserveRecentApiRounds: getInteger(
              reactiveCompaction,
              "preserveRecentApiRounds",
              ["apps", "playgroundServer", "compaction", "reactive"],
              DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.reactive
                .preserveRecentApiRounds,
              1,
            ),
            microBatchGroups: getInteger(
              reactiveCompaction,
              "microBatchGroups",
              ["apps", "playgroundServer", "compaction", "reactive"],
              DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.reactive.microBatchGroups,
              1,
            ),
            maxReactiveCompactionsPerRequest: getInteger(
              reactiveCompaction,
              "maxReactiveCompactionsPerRequest",
              ["apps", "playgroundServer", "compaction", "reactive"],
              DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.compaction.reactive
                .maxReactiveCompactionsPerRequest,
              1,
            ),
          },
        },
        userMemory: {
          enabled: getBoolean(
            userMemory,
            "enabled",
            ["apps", "playgroundServer", "userMemory"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userMemory.enabled,
          ),
          idleMinutes: getInteger(
            userMemory,
            "idleMinutes",
            ["apps", "playgroundServer", "userMemory"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userMemory.idleMinutes,
            1,
          ),
          scanIntervalMinutes: getInteger(
            userMemory,
            "scanIntervalMinutes",
            ["apps", "playgroundServer", "userMemory"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userMemory.scanIntervalMinutes,
            1,
          ),
          minIntervalHours: getInteger(
            userMemory,
            "minIntervalHours",
            ["apps", "playgroundServer", "userMemory"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userMemory.minIntervalHours,
            1,
          ),
          minChangedSessions: getInteger(
            userMemory,
            "minChangedSessions",
            ["apps", "playgroundServer", "userMemory"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userMemory.minChangedSessions,
            1,
          ),
        },
        userPreferenceSummary: {
          enabled: getBoolean(
            userPreferenceSummary,
            "enabled",
            ["apps", "playgroundServer", "userPreferenceSummary"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userPreferenceSummary.enabled,
          ),
          minSessions: getInteger(
            userPreferenceSummary,
            "minSessions",
            ["apps", "playgroundServer", "userPreferenceSummary"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userPreferenceSummary.minSessions,
            1,
          ),
          cooldownHours: getInteger(
            userPreferenceSummary,
            "cooldownHours",
            ["apps", "playgroundServer", "userPreferenceSummary"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userPreferenceSummary.cooldownHours,
            1,
          ),
          maxSessionsToRead: getInteger(
            userPreferenceSummary,
            "maxSessionsToRead",
            ["apps", "playgroundServer", "userPreferenceSummary"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userPreferenceSummary.maxSessionsToRead,
            1,
          ),
          maxMessagesPerRun: getInteger(
            userPreferenceSummary,
            "maxMessagesPerRun",
            ["apps", "playgroundServer", "userPreferenceSummary"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.userPreferenceSummary.maxMessagesPerRun,
            1,
          ),
        },
        skills: {
          delegateToSubAgent: getBoolean(
            skills,
            "delegateToSubAgent",
            ["apps", "playgroundServer", "skills"],
            DEFAULT_AGENTRAIL_CONFIG.apps.playgroundServer.skills.delegateToSubAgent,
          ),
        },
      },
      deepResearch: {
        port: getInteger(
          deepResearch,
          "port",
          ["apps", "deepResearch"],
          DEFAULT_AGENTRAIL_CONFIG.apps.deepResearch.port,
          1,
          65535,
        ),
      },
      playgroundUi: {
        port: getInteger(
          playgroundUi,
          "port",
          ["apps", "playgroundUi"],
          DEFAULT_AGENTRAIL_CONFIG.apps.playgroundUi.port,
          1,
          65535,
        ),
        backendPort: getInteger(
          playgroundUi,
          "backendPort",
          ["apps", "playgroundUi"],
          DEFAULT_AGENTRAIL_CONFIG.apps.playgroundUi.backendPort,
          1,
          65535,
        ),
      },
    },
    permissions: parsePermissionsBlock(root),
  };
}

function parsePermissionsBlock(root: UnknownRecord): AgentrailPermissionsConfig | undefined {
  const raw = root["permissions"];
  if (raw === undefined) return undefined;
  const perm = assertObject(raw, ["permissions"]);
  assertNoUnknownKeys(perm, ["mode", "allow", "deny", "ask"], ["permissions"]);

  const VALID_MODES = ["default", "acceptEdits", "bypassPermissions", "dontAsk"] as const;
  type PermMode = (typeof VALID_MODES)[number];

  let mode: PermMode | undefined;
  const rawMode = perm["mode"];
  if (rawMode !== undefined) {
    if (typeof rawMode !== "string" || !(VALID_MODES as readonly string[]).includes(rawMode)) {
      throw new Error(
        `Invalid permissions.mode "${rawMode}". Must be one of: ${VALID_MODES.join(", ")}.`,
      );
    }
    mode = rawMode as PermMode;
  }

  return {
    mode,
    allow: getStringArray(perm, "allow", ["permissions"]),
    deny: getStringArray(perm, "deny", ["permissions"]),
    ask: getStringArray(perm, "ask", ["permissions"]),
  };
}

/** Loads, parses, and validates the Agentrail config file from disk. */
export function loadAgentrailConfig(options: LoadAgentrailConfigOptions = {}): AgentrailConfig {
  const configPath = resolveAgentrailConfigPath(options);
  const source = readFileSync(configPath, "utf8");
  const document = parseDocument(source, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    const message = document.errors.map((error) => error.message).join("\n");
    throw new Error(`Failed to parse ${configPath}:\n${message}`);
  }

  return parseAgentrailConfig(document.toJS());
}

function resolveSharedFields(config: AgentrailConfig): SharedResolvedAppConfig {
  const baseUrl = normalizeOptionalString(config.llm.baseUrl);
  const tavilyApiKey = normalizeOptionalString(config.search.tavilyApiKey);
  const braveApiKey = normalizeOptionalString(config.search.braveApiKey);
  const jinaApiKey = normalizeOptionalString(config.search.jinaApiKey);
  const uiSecretToken = normalizeOptionalString(config.auth.uiSecretToken);

  return {
    provider: config.llm.provider,
    modelId: config.llm.modelId,
    ...(baseUrl ? { baseUrl } : {}),
    searchProvider: config.search.provider,
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
    ...(braveApiKey ? { braveApiKey } : {}),
    ...(jinaApiKey ? { jinaApiKey } : {}),
    dataDir: config.paths.dataDir,
    ...(uiSecretToken ? { uiSecretToken } : {}),
    sandbox: {
      image: config.sandbox.image,
      idleTimeoutMs: config.sandbox.idleTimeoutMs,
    },
    orchestration: {
      subagent: {
        pollIntervalMs: config.orchestration.subagent.pollIntervalMs,
        fakeExecution: config.orchestration.subagent.fakeExecution,
      },
    },
  };
}

/** Returns the resolved config shape used by the playground server example. */
export function getPlaygroundServerConfig(
  config: AgentrailConfig = loadAgentrailConfig(),
): PlaygroundServerConfig {
  const shared = resolveSharedFields(config);
  return {
    ...shared,
    port: config.apps.playgroundServer.port,
    compaction: config.apps.playgroundServer.compaction,
    userMemory: config.apps.playgroundServer.userMemory,
    userPreferenceSummary: config.apps.playgroundServer.userPreferenceSummary,
    skillDelegateToSubAgent: config.apps.playgroundServer.skills.delegateToSubAgent,
  };
}

/** Returns the resolved config shape used by the deep research example. */
export function getDeepResearchConfig(
  config: AgentrailConfig = loadAgentrailConfig(),
): DeepResearchConfig {
  const shared = resolveSharedFields(config);
  return {
    ...shared,
    port: config.apps.deepResearch.port,
  };
}

/** Returns the resolved config shape used by the playground UI example. */
export function getPlaygroundUiConfig(
  config: AgentrailConfig = loadAgentrailConfig(),
): PlaygroundUiConfig {
  return {
    port: config.apps.playgroundUi.port,
    backendPort: config.apps.playgroundUi.backendPort,
  };
}
