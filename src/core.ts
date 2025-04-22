import * as fs from 'fs-extra';
import * as path from 'path';

const DEFAULT_SNAPSHOT_DIR = '.env-snapshots';
const DEFAULT_ENV_FILE = '.env';

function readConfig() {
  const configPath = path.resolve(process.cwd(), 'env-snap.config.json');
  if (fs.existsSync(configPath)) {
    try {
      return fs.readJsonSync(configPath);
    } catch {
      // ignore parse errors, fallback to defaults
    }
  }
  return {};
}

export function getSnapshotDir(): string {
  const config = readConfig();
  return path.resolve(process.cwd(), config.snapshotDir || DEFAULT_SNAPSHOT_DIR);
}

export function getSnapshotFiles(): string[] {
  const config = readConfig();
  if (Array.isArray(config.files) && config.files.length > 0) {
    return config.files.map((f: string) => path.resolve(process.cwd(), f));
  }
  // fallback to single envFile or default
  if (config.envFile) {
    return [path.resolve(process.cwd(), config.envFile)];
  }
  return [path.resolve(process.cwd(), DEFAULT_ENV_FILE)];
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-');
}

export async function init() {
  const dir = getSnapshotDir();
  await fs.ensureDir(dir);
  console.log(`Initialized env-snap. Snapshots will be stored in ${dir}`);
}

async function runGitIntegrationAfterSnapshot(message: string, id: string) {
  const config = readConfig();
  if (config.autoGitCommit || config.autoPush || config.branch || config.tag || (Array.isArray(config.commitHooks) && config.commitHooks.length > 0)) {
    try {
      const git = await import('./git');
      await git.runPostSnapshotGitIntegration(message, id, config);
    } catch (e: any) {
      console.error('Git integration failed:', e.message);
    }
  }
}

export async function snapshot(description?: string) {
  const files = getSnapshotFiles();
  const dir = getSnapshotDir();
  await fs.ensureDir(dir);
  const id = getTimestamp();
  let allExist = true;
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      allExist = false;
    }
  }
  if (!allExist) return;
  for (const file of files) {
    const snapPath = path.join(dir, `env-${id}__${path.basename(file)}`);
    await fs.copy(file, snapPath);
  }
  // Gather extra metadata
  const os = await import('os');
  let gitInfo = { hash: '', branch: '' };
  try {
    const { execSync } = await import('child_process');
    gitInfo.hash = execSync('git rev-parse HEAD').toString().trim();
    gitInfo.branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch {}
  const user = os.userInfo().username;
  const hostname = os.hostname();
  const fileStats = await Promise.all(files.map(async (f) => {
    try {
      const stat = await fs.stat(f);
      return { file: path.basename(f), size: stat.size };
    } catch {
      return { file: path.basename(f), size: null };
    }
  }));
  // Save meta for this group
  const metaPath = path.join(dir, `env-${id}.json`);
  await fs.writeJson(metaPath, {
    description,
    timestamp: id,
    files: files.map(f => path.basename(f)),
    user,
    hostname,
    git: gitInfo,
    fileStats
  });
  console.log(`Snapshot created: env-${id} for files: ${files.map(f => path.basename(f)).join(', ')}` + (description ? `\nDescription: ${description}` : ''));
  await runGitIntegrationAfterSnapshot(description ? `env-snap: ${description}` : 'env-snap: snapshot update', id);
  await runHooksAfterSnapshot(id, description, { user, hostname });
}

async function runHooksAfterSnapshot(id: string, description: string | undefined, ctx: { user: string, hostname: string }) {
  const config = readConfig();
  if (!Array.isArray(config.hooks)) return;
  const SNAPSHOT_ID = id;
  const USER = ctx.user;
  const HOST = ctx.hostname;
  for (const hook of config.hooks) {
    if (hook.type === 'shell' && hook.command) {
      const cmd = hook.command.replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
      try {
        const { exec } = await import('child_process');
        exec(cmd, (err) => {
          if (err) console.error('Shell hook failed:', err.message);
        });
      } catch (e: any) {
        console.error('Shell hook error:', e.message);
      }
    } else if (hook.type === 'webhook' && hook.url) {
      try {
        const fetch = (await import('node-fetch')).default;
        const body = JSON.stringify(hook.body || {}).replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
        await fetch(hook.url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('Webhook hook error:', e.message);
      }
    } else if (hook.type === 'slack' && hook.webhook) {
      try {
        const fetch = (await import('node-fetch')).default;
        const msg = (hook.message || '').replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
        await fetch(hook.webhook, { method: 'POST', body: JSON.stringify({ text: msg }), headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('Slack hook error:', e.message);
      }
    }
    else if (hook.type === 'discord' && hook.webhook) {
      try {
        const fetch = (await import('node-fetch')).default;
        const content = (hook.content || '').replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
        await fetch(hook.webhook, { method: 'POST', body: JSON.stringify({ content }), headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('Discord hook error:', e.message);
      }
    }
    else if (hook.type === 'teams' && hook.webhook) {
      try {
        const fetch = (await import('node-fetch')).default;
        const text = (hook.text || '').replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
        await fetch(hook.webhook, { method: 'POST', body: JSON.stringify({ text }), headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.error('Teams hook error:', e.message);
      }
    }
  }
}


export async function list() {
  const dir = getSnapshotDir();
  await fs.ensureDir(dir);
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.log('No snapshots found.');
    return;
  }
  for (const metaFile of files) {
    const meta = await fs.readJson(path.join(dir, metaFile));
    const id = metaFile.replace(/\.json$/, '');
    const desc = meta.description ? ` - ${meta.description}` : '';
    const user = meta.user ? ` | user: ${meta.user}` : '';
    const host = meta.hostname ? ` | host: ${meta.hostname}` : '';
    const git = meta.git && meta.git.hash ? ` | git: ${meta.git.hash.substring(0,7)}@${meta.git.branch}` : '';
    console.log(`${id}${desc}${user}${host}${git}`);
  }
}

export async function snapshotInfo(id: string) {
  const dir = getSnapshotDir();
  const metaPath = path.join(dir, (id.startsWith('env-') ? id : `env-${id}`) + '.json');
  if (!(await fs.pathExists(metaPath))) {
    console.error('Snapshot metadata not found:', metaPath);
    return;
  }
  const meta = await fs.readJson(metaPath);
  console.log('Snapshot Info:');
  console.log(JSON.stringify(meta, null, 2));
}

export async function getSnapshotGroup(id: string): Promise<{files: string[], meta: any, id: string}> {
  const dir = getSnapshotDir();
  const metaPath = path.join(dir, (id.startsWith('env-') ? id : `env-${id}`) + '.json');
  if (!await fs.pathExists(metaPath)) throw new Error('Snapshot metadata not found: ' + metaPath);
  const meta = await fs.readJson(metaPath);
  const files = meta.files || ['.env'];
  return { files, meta, id: id.startsWith('env-') ? id : `env-${id}` };
}

export async function revert(id: string) {
  const dir = getSnapshotDir();
  let group;
  try {
    group = await getSnapshotGroup(id);
  } catch (e: any) {
    console.error(e.message);
    return;
  }
  for (const file of group.files) {
    const snapPath = path.join(dir, `${group.id}__${file}`);
    if (!fs.existsSync(snapPath)) {
      console.error(`Snapshot file not found: ${snapPath}`);
      continue;
    }
    await fs.copy(snapPath, path.resolve(process.cwd(), file));
  }
  let desc = '';
  if (group.meta && group.meta.description) {
    desc = `\nDescription: ${group.meta.description}`;
  }
  console.log(`Restored files: ${group.files.join(', ')} from snapshot: ${group.id}${desc}`);
}

export async function setSnapshotDescription(id: string, description: string) {
  const dir = getSnapshotDir();
  const snapPath = path.join(dir, id.startsWith('env-') ? id : `env-${id}`);
  const metaPath = snapPath + '.json';
  let meta = {};
  if (await fs.pathExists(metaPath)) {
    meta = await fs.readJson(metaPath);
  }
  meta = { ...meta, description };
  await fs.writeJson(metaPath, meta);
  console.log(`Description set for snapshot ${id}: ${description}`);
}

export async function getSnapshotMeta(id: string): Promise<{description?: string, timestamp?: string, files?: string[]} | null> {
  const dir = getSnapshotDir();
  const metaPath = path.join(dir, (id.startsWith('env-') ? id : `env-${id}`) + '.json');
  if (await fs.pathExists(metaPath)) {
    return await fs.readJson(metaPath);
  }
  return null;
}

export async function pruneSnapshots(keep: number = 5) {
  const dir = getSnapshotDir();
  if (!fs.existsSync(dir)) {
    console.log('No snapshots found.');
    return;
  }
  const files = (await fs.readdir(dir))
    .filter((f: string) => f.startsWith('env-') && !f.endsWith('.json'))
    .sort();
  if (files.length <= keep) {
    console.log(`Nothing to prune. Total snapshots: ${files.length}`);
    return;
  }
  const toDelete = files.slice(0, files.length - keep);
  for (const file of toDelete) {
    const snapPath = path.join(dir, file);
    const metaPath = snapPath + '.json';
    await fs.remove(snapPath);
    if (await fs.pathExists(metaPath)) {
      await fs.remove(metaPath);
    }
    console.log(`Deleted snapshot: ${file}`);
  }
  console.log(`Pruned to keep last ${keep} snapshots.`);
}
