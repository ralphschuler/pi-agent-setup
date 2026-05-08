#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const PREFIX = "pi-";

function usage() {
  return [
    "Usage: pi-screen [options] [-- pi args...]",
    "",
    "Run pi inside GNU screen for unattended, resumable sessions.",
    "",
    "Behavior:",
    "  inside a Git repository: attach existing repo session or create one",
    "  outside a Git repository: show a picker for pi-screen sessions only",
    "",
    "Options:",
    "  --name <name>   Use a specific pi-screen session name/slug",
    "  --new           Create a new session even when one exists",
    "  --detach        Start a new session detached",
    "  --list          List pi-screen-managed sessions",
    "  --dry-run       Print the screen command instead of running it",
    "  --help, -h      Show this help",
    "",
    "Examples:",
    "  pi-screen",
    '  pi-screen --detach -- "fix failing tests"',
    "  pi-screen --name docs --new",
    "  pi-screen --list",
  ].join("\n");
}

function parseArgs(argv) {
  const opts = { piArgs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      opts.piArgs = argv.slice(i + 1);
      break;
    }
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--list") opts.list = true;
    else if (arg === "--new") opts.new = true;
    else if (arg === "--detach") opts.detach = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--name") {
      const name = argv[++i];
      if (!name) throw new Error("--name requires a value");
      opts.name = name;
    } else if (arg.startsWith("--name=")) {
      opts.name = arg.slice("--name=".length);
    } else {
      opts.piArgs.push(arg);
    }
  }
  return opts;
}

function commandExists(command) {
  const result = spawnSync("command", ["-v", command], { shell: true, encoding: "utf8" });
  return result.status === 0;
}

function run(command, args, options = {}) {
  if (options.dryRun) {
    process.stdout.write(`${[command, ...args].map(shellQuote).join(" ")}\n`);
    return { status: 0 };
  }
  return spawnSync(command, args, { stdio: options.stdio ?? "inherit", encoding: "utf8" });
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function gitRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "session"
  );
}

function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function managedName(label, identity = label) {
  const clean = slugify(label.startsWith(PREFIX) ? label.slice(PREFIX.length) : label);
  return `${PREFIX}${clean}-${shortHash(identity)}`;
}

function uniqueManagedName(baseName) {
  return `${baseName}-${Date.now().toString(36)}`;
}

function namedSession(label, identity, sessions) {
  const exact = sessions.find((session) => session.name === label || session.full.endsWith(`.${label}`));
  if (exact) return exact.name;
  return managedName(label, identity);
}

function defaultName(cwd, repoRoot) {
  const root = repoRoot || cwd;
  return managedName(path.basename(root), root);
}

function listSessions() {
  const result = spawnSync("screen", ["-ls"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  return parseScreenList(output).filter((session) => session.name.startsWith(PREFIX));
}

function parseScreenList(output) {
  const sessions = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+\.([^\s]+)|([^\s()]+))\s*(?:\(([^)]*)\))?/);
    if (!match) continue;
    const full = match[1];
    const name = match[2] || match[3];
    if (!name || name === "No" || name === "There") continue;
    sessions.push({ full, name, status: line.includes("(Attached)") ? "Attached" : line.includes("(Detached)") ? "Detached" : "Unknown" });
  }
  return sessions;
}

function printSessions(sessions) {
  if (sessions.length === 0) {
    process.stdout.write("No pi-screen sessions.\n");
    return;
  }
  process.stdout.write("pi-screen sessions:\n");
  for (const session of sessions) process.stdout.write(`  ${session.name} (${session.status})\n`);
}

function findSession(sessions, name) {
  return sessions.find((session) => session.name === name || session.full.endsWith(`.${name}`));
}

function attach(session, opts) {
  if (opts.piArgs.length > 0)
    process.stderr.write("pi-screen: existing session found; pi args ignored while attaching. Use --new or --name for another session.\n");
  return run("screen", ["-r", session.name], opts);
}

function start(name, opts) {
  const args = opts.detach ? ["-dmS", name, "pi", ...opts.piArgs] : ["-S", name, "pi", ...opts.piArgs];
  return run("screen", args, opts);
}

async function promptNewName(cwd) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const fallback = slugify(path.basename(cwd));
  const answer = await new Promise((resolve) => rl.question(`New pi-screen session name [${fallback}]: `, resolve));
  rl.close();
  return answer.trim() || fallback;
}

async function picker(sessions, cwd, opts) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printSessions(sessions);
    process.stdout.write("\nRun `pi-screen --name <name> --new` to create one, or `pi-screen --name <session>` to attach.\n");
    return { status: 0 };
  }

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isRaw) process.stdin.setRawMode(true);
  let selected = 0;
  const items = [...sessions.map((session) => ({ type: "session", session })), { type: "new" }];

  const render = () => {
    process.stdout.write("\x1b[2J\x1b[H");
    process.stdout.write("╭─ pi-screen sessions ─╮\n");
    if (sessions.length === 0) process.stdout.write("│ No pi-screen sessions │\n");
    items.forEach((item, index) => {
      const cursor = index === selected ? "›" : " ";
      const text = item.type === "new" ? "Create new session" : `${item.session.name} (${item.session.status})`;
      process.stdout.write(`${cursor} ${text}\n`);
    });
    process.stdout.write("\n↑/↓ select  Enter choose  q quit\n");
  };

  render();
  return await new Promise((resolve) => {
    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      if (process.stdin.isRaw) process.stdin.setRawMode(false);
      process.stdout.write("\x1b[2J\x1b[H");
    };
    const onKey = async (_str, key = {}) => {
      if (key.name === "down") selected = Math.min(selected + 1, items.length - 1);
      else if (key.name === "up") selected = Math.max(selected - 1, 0);
      else if (key.name === "q" || (key.ctrl && key.name === "c")) {
        cleanup();
        resolve({ status: 0 });
        return;
      } else if (key.name === "return") {
        const item = items[selected];
        cleanup();
        if (item.type === "session") resolve(attach(item.session, opts));
        else {
          const label = await promptNewName(cwd);
          resolve(start(managedName(label, `${cwd}:${label}`), { ...opts, new: true }));
        }
        return;
      }
      render();
    };
    process.stdin.on("keypress", onKey);
  });
}

async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`pi-screen: ${error.message}\n`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (!commandExists("screen")) {
    process.stderr.write("pi-screen: GNU screen not found in PATH. Install screen and retry.\n");
    return 1;
  }
  if (!commandExists("pi")) {
    process.stderr.write("pi-screen: pi CLI not found in PATH. Install pi and retry.\n");
    return 1;
  }

  const cwd = process.cwd();
  const repo = gitRoot(cwd);
  const sessions = listSessions();

  if (opts.list) {
    printSessions(sessions);
    return 0;
  }

  if (repo) {
    const baseName = opts.name ? namedSession(opts.name, `${repo}:${opts.name}`, sessions) : defaultName(cwd, repo);
    const existing = findSession(sessions, baseName);
    const name = opts.new && existing ? uniqueManagedName(baseName) : baseName;
    const result = existing && !opts.new ? attach(existing, opts) : start(name, opts);
    return result.status ?? 0;
  }

  if (opts.name) {
    const baseName = namedSession(opts.name, `${cwd}:${opts.name}`, sessions);
    const existing = findSession(sessions, baseName);
    const name = opts.new && existing ? uniqueManagedName(baseName) : baseName;
    const result = existing && !opts.new ? attach(existing, opts) : start(name, opts);
    return result.status ?? 0;
  }

  const result = await picker(sessions, cwd, opts);
  return result.status ?? 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const status = await main();
  process.exit(status);
}

export { defaultName, managedName, namedSession, parseArgs, parseScreenList, slugify, uniqueManagedName };
