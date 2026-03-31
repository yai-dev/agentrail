import { SessionManager } from "@agentrail/memo";
import { SandboxManager } from "@agentrail/sandbox";

const DATA_DIR = process.env.DATA_DIR ?? "./data";

export const sessionManager = new SessionManager(DATA_DIR);
export const sandboxManager = new SandboxManager(DATA_DIR);
