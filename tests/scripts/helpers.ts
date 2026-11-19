import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(import.meta.dir, '..', '..');
export const GUIDE_REL = '.claude/skills/docs-writer/references/style-guide.md';

// On Windows a bare `bash` can resolve to WSL's launcher; the scripts are tested under Git Bash.
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const BASH = process.platform === 'win32' && existsSync(GIT_BASH) ? GIT_BASH : 'bash';

/** Forward slashes, so a Windows path survives as a bash argument. */
export const posix = (p: string) => p.replaceAll('\\', '/');

// The tests run concurrently, and each spawns git and bash many times. Process start-up is slow
// on Windows, so only a few run at once; the rest wait their turn.
const MAX_PROCESSES = 4;
let running = 0;
const waiting: Array<() => void> = [];

async function run(cmd: string[], cwd?: string): Promise<{ code: number; out: string }> {
  if (running >= MAX_PROCESSES) await new Promise<void>((go) => waiting.push(go));
  else running++;
  try {
    const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { code, out: stdout + stderr };
  } finally {
    const next = waiting.shift();
    if (next) next(); // hands the slot over
    else running--;
  }
}

/** Runs git in a repo and returns trimmed output; throws when git fails. */
export async function git(root: string, ...args: string[]): Promise<string> {
  const res = await run(['git', '-C', root, ...args]);
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.out}`);
  return res.out.trim();
}

/**
 * A throwaway clone on `main` with a bare `origin`, the style guide committed and pushed
 * (unless `localGuide` is null), and a `.env` holding `env`.
 */
export async function makeRepo(localGuide: string | null, env = ''): Promise<{ root: string; origin: string; guidePath: string }> {
  const base = await mkdtemp(join(tmpdir(), 'style-guide-sync-'));
  const origin = join(base, 'origin.git');
  const root = join(base, 'clone');
  await run(['git', 'init', '--bare', '-b', 'main', origin]);
  await run(['git', 'init', '-b', 'main', root]);
  await git(root, 'config', 'user.name', 'Sync Test');
  await git(root, 'config', 'user.email', 'sync-test@example.invalid');
  await git(root, 'config', 'core.autocrlf', 'false');
  await git(root, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(root, '.gitignore'), '.env\n.state/\n');
  const guidePath = join(root, GUIDE_REL);
  if (localGuide !== null) {
    await mkdir(dirname(guidePath), { recursive: true });
    await writeFile(guidePath, localGuide);
  }
  await writeFile(join(root, '.env'), env);
  await git(root, 'add', '-A');
  await git(root, 'commit', '-m', 'initial');
  await git(root, 'remote', 'add', 'origin', posix(origin));
  await git(root, 'push', '-u', 'origin', 'main');
  return { root, origin, guidePath };
}

/** Runs the sync script against a throwaway clone, never touching docker. */
export function runSync(root: string, args: string[]): Promise<{ code: number; out: string }> {
  return run([BASH, posix(join(REPO, 'scripts', 'sync-style-guide.sh')), '--repo-root', posix(root), '--skip-docker', ...args]);
}

/**
 * Runs the sync with docker enabled, against a stand-in `docker` that only records its arguments.
 * Returns the recorded calls, one per line ("compose build docs-writer").
 */
export async function runSyncWithDocker(root: string, args: string[], dockerExit = 0): Promise<{ code: number; out: string; docker: string[] }> {
  const bin = join(dirname(root), `fake-bin-${crypto.randomUUID()}`);
  const calls = join(bin, 'calls.log');
  await mkdir(bin);
  await writeFile(join(bin, 'docker'), `#!/usr/bin/env bash\necho "$*" >> "${posix(calls)}"\nexit ${dockerExit}\n`, { mode: 0o755 });
  // "cd && pwd" turns the directory into the shell's own path form, so it is safe inside PATH.
  const res = await run([
    BASH, '-c', 'PATH="$(cd "$1" && pwd):$PATH" exec bash "$2" "${@:3}"', '_',
    posix(bin), posix(join(REPO, 'scripts', 'sync-style-guide.sh')), '--repo-root', posix(root), ...args,
  ]);
  const docker = existsSync(calls) ? (await readFile(calls, 'utf8')).split('\n').filter(Boolean) : [];
  return { ...res, docker };
}

/** Runs any script under scripts/ with bash. */
export function runScript(name: string, args: string[]): Promise<{ code: number; out: string }> {
  return run([BASH, posix(join(REPO, 'scripts', name)), ...args]);
}

// Read with LF line endings whatever the checkout did (autocrlf on Windows): the tests compare
// against what the script writes, and it writes LF.
export async function fixture(name: string): Promise<string> {
  return (await readFile(join(REPO, 'tests', 'fixtures', 'style-guide', name), 'utf8')).replace(/\r\n/g, '\n');
}

/** Writes an upstream variant next to the clone and returns its path as a bash argument. */
export async function upstreamFile(root: string, content: string): Promise<string> {
  const path = join(dirname(root), `upstream-${crypto.randomUUID()}.md`);
  await writeFile(path, content);
  return posix(path);
}

/** The status the sync wrote (default path), or null when there is none. */
export async function readStatus(root: string, path = join(root, '.state', 'style-guide-sync.status.json')): Promise<Record<string, unknown> | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}
