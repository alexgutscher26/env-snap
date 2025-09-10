import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { performance } from 'perf_hooks';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { exec, execSync } from 'child_process';
import { userInfo } from 'os';
import crypto from 'crypto';
import { Table } from './utils';
import { cache } from './cache';

function createHash(algorithm: string): crypto.Hash {
  return crypto.createHash(algorithm);
}
import { isError } from 'node:util';

interface SnapshotMetadata {
  id: string;
  timestamp: string;
  description?: string;
  tags?: string[];
  files: string[];
  user: string;
  hostname: string;
  git: {
    hash: string;
    branch: string;
    remote: string | null;
  };
  system: {
    platform: string;
    nodeVersion: string;
    memory: {
      total: number;
      free: number;
    };
  };
  stats: {
    totalSize: number;
    duration: number;
    files: Array<{
      name: string;
      size: number;
      hash: string;
    }>;
  };
};

const DEFAULT_SNAPSHOT_DIR = '.env-snapshots';
const DEFAULT_ENV_FILE = '.env';

function readConfig(): Record<string, any> {
  const configPath = path.resolve(process.cwd(), 'env-snap.config.json');
  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const config = fs.readJsonSync(configPath);
    validateConfig(config);
    return config;
  } catch (error: unknown) {
    console.error(chalk.red(`Error reading config: ${isError(error) ? error.message : String(error)}`));
    return {};
  }
}

function validateConfig(config: Record<string, any>): void {
  if (config.snapshotDir && typeof config.snapshotDir !== 'string') {
    throw new Error('snapshotDir must be a string');
  }
  if (config.files && !Array.isArray(config.files)) {
    throw new Error('files must be an array');
  }
  if (config.envFile && typeof config.envFile !== 'string') {
    throw new Error('envFile must be a string');
  }
  if (config.maxSnapshots && typeof config.maxSnapshots !== 'number') {
    throw new Error('maxSnapshots must be a number');
  }
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

export async function snapshot(description?: string, tags?: string[]): Promise<string> {
  const startTime = performance.now();
  const files = getSnapshotFiles();
  const dir = getSnapshotDir();

  if (files.length === 0) {
    throw new Error('No environment files configured for snapshotting');
  }

  try {
    await fs.ensureDir(dir);

    // Validate all files exist before proceeding
    const missingFiles = files.filter(file => !fs.existsSync(file));
    if (missingFiles.length > 0) {
      throw new Error(`Missing required files: ${missingFiles.join(', ')}`);
    }

    // Generate unique snapshot ID
    const id = uuidv4();

    // Process files with progress tracking
    const filePromises = files.map(async (file) => {
      const snapPath = path.join(dir, `env-${id}__${path.basename(file)}`);
      const stat = await fs.stat(file);
      const hash = await calculateFileHash(file);

      try {
        await fs.copy(file, snapPath);
        return {
          name: path.basename(file),
          size: stat.size,
          hash,
          status: 'success'
        };
      } catch (error: unknown) {
        return {
          name: path.basename(file),
          size: stat.size,
          hash,
          status: 'failed',
          error: isError(error) ? error.message : String(error)
        };
      }
    });

    const fileResults = await Promise.all(filePromises);

    // Gather system information
    const os = await import('os');
    const { execSync } = await import('child_process');

    const gitInfo = {
      hash: '' as string,
      branch: '' as string,
      remote: null as string | null
    };

    try {
      gitInfo.hash = execSync('git rev-parse HEAD').toString().trim() || '';
      gitInfo.branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim() || '';
      gitInfo.remote = execSync('git config --get remote.origin.url').toString().trim() || null;
    } catch {}

    // Create metadata
    const metadata: SnapshotMetadata = {
      id,
      timestamp: new Date().toISOString(),
      description,
      tags, // Add tags to metadata
      files: files.map(f => path.basename(f)),
      user: os.userInfo().username,
      hostname: os.hostname(),
      git: gitInfo,
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        memory: {
          total: os.totalmem(),
          free: os.freemem()
        }
      },
      stats: {
        totalSize: fileResults.reduce((sum, file) => sum + (file.size || 0), 0),
        duration: performance.now() - startTime,
        files: fileResults.map(file => ({
          name: file.name,
          size: file.size,
          hash: file.hash
        }))
      }
    };

    // Save metadata
    const metaPath = path.join(dir, `env-${id}.json`);
    await fs.writeJson(metaPath, metadata, { spaces: 2 });

    // Run git integration if configured
    await runGitIntegrationAfterSnapshot(description || 'Automatic snapshot', id);

    // Run any configured hooks
    await runHooksAfterSnapshot(id, description, {
      user: metadata.user,
      hostname: metadata.hostname
    });

    // Prune old snapshots if configured
    const config = readConfig();
    if (config.maxSnapshots) {
      await pruneSnapshots(config.maxSnapshots);
    }

    console.log(chalk.green(`Created snapshot ${id} (${fileResults.length} files)`));
    if (tags && tags.length > 0) {
      console.log(chalk.gray(`Tags: ${tags.join(', ')}`));
    }
    console.log(chalk.gray(`Duration: ${Math.round(metadata.stats.duration)}ms`));
    return id;

  } catch (error: unknown) {
    console.error(chalk.red(`Failed to create snapshot: ${isError(error) ? error.message : String(error)}`));
    throw error;
  }
}

async function calculateFileHash(file: string): Promise<string> {
  const hash = createHash('sha256');
  const data = await fs.readFile(file);
  hash.update(data);
  return hash.digest('hex');
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
      } catch (e: unknown) {
        if (isError(e)) {
          console.error('Shell hook error:', e.message);
        } else {
          console.error('Shell hook error:', String(e));
        }
      }
    } else if (hook.type === 'webhook' && hook.url) {
      try {
        const fetch = (await import('node-fetch')).default;
        const body = JSON.stringify(hook.body || {}).replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
        await fetch(hook.url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
      } catch (e: unknown) {
        if (isError(e)) {
          console.error('Webhook hook error:', e.message);
        } else {
          console.error('Webhook hook error:', String(e));
        }
      }
    } else if (hook.type === 'slack' && hook.webhook) {
      try {
        const fetch = (await import('node-fetch')).default;
        const msg = (hook.message || '').replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
        await fetch(hook.webhook, { method: 'POST', body: JSON.stringify({ text: msg }), headers: { 'Content-Type': 'application/json' } });
      } catch (e: unknown) {
        if (isError(e)) {
          console.error('Slack hook error:', e.message);
        } else {
          console.error('Slack hook error:', String(e));
        }
      }
    }
    else if (hook.type === 'discord' && hook.webhook) {
      try {
        const fetch = (await import('node-fetch')).default;
        const content = (hook.content || '').replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
        await fetch(hook.webhook, { method: 'POST', body: JSON.stringify({ content }), headers: { 'Content-Type': 'application/json' } });
      } catch (e: unknown) {
        if (isError(e)) {
          console.error('Discord hook error:', e.message);
        } else {
          console.error('Discord hook error:', String(e));
        }
      }
    }
    else if (hook.type === 'teams' && hook.webhook) {
      try {
        const fetch = (await import('node-fetch')).default;
        const text = (hook.text || '').replace(/\$SNAPSHOT_ID/g, SNAPSHOT_ID).replace(/\$USER/g, USER).replace(/\$HOST/g, HOST);
        await fetch(hook.webhook, { method: 'POST', body: JSON.stringify({ text }), headers: { 'Content-Type': 'application/json' } });
      } catch (e: unknown) {
        if (isError(e)) {
          console.error('Teams hook error:', e.message);
        } else {
          console.error('Teams hook error:', String(e));
        }
      }
    }
  }
}


export async function list() {
  // Check cache first
  const cacheKey = 'snapshot-list';
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(cached);
    return;
  }
  
  const dir = getSnapshotDir();
  await fs.ensureDir(dir);
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.log('No snapshots found.');
    return;
  }
  
  const table = new Table([
    { title: 'ID', width: 36 },
    { title: 'Description', width: 30 },
    { title: 'Timestamp', width: 20 },
    { title: 'Tags', width: 20 }
  ]);
  
  for (const metaFile of files) {
    const meta = await fs.readJson(path.join(dir, metaFile));
    const id = metaFile.replace(/\.json$/, '').substring(0, 36);
    const desc = meta.description || '';
    const timestamp = new Date(meta.timestamp).toLocaleDateString();
    const tags = meta.tags ? meta.tags.join(', ') : '';
    
    table.addRow(id, desc, timestamp, tags);
  }
  
  const output = table.toString();
  console.log(output);
  
  // Cache for 1 minute
  cache.set(cacheKey, output, 60 * 1000);
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

export async function getSnapshotMeta(id: string): Promise<{description?: string, timestamp?: string, files?: string[], tags?: string[]} | null> {
  // Check cache first
  const cacheKey = `snapshot-meta-${id}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const dir = getSnapshotDir();
  const metaPath = path.join(dir, (id.startsWith('env-') ? id : `env-${id}`) + '.json');
  if (await fs.pathExists(metaPath)) {
    const meta = await fs.readJson(metaPath);
    // Cache for 5 minutes
    cache.set(cacheKey, meta, 5 * 60 * 1000);
    return meta;
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

export async function addTagToSnapshot(id: string, tag: string) {
  const dir = getSnapshotDir();
  const metaPath = path.join(dir, (id.startsWith('env-') ? id : `env-${id}`) + '.json');
  
  if (!(await fs.pathExists(metaPath))) {
    throw new Error(`Snapshot metadata not found: ${metaPath}`);
  }
  
  const meta = await fs.readJson(metaPath);
  
  // Initialize tags array if it doesn't exist
  if (!meta.tags) {
    meta.tags = [];
  }
  
  // Add tag if it doesn't already exist
  if (!meta.tags.includes(tag)) {
    meta.tags.push(tag);
    await fs.writeJson(metaPath, meta, { spaces: 2 });
    console.log(`Added tag '${tag}' to snapshot ${id}`);
  } else {
    console.log(`Tag '${tag}' already exists on snapshot ${id}`);
  }
}

export async function removeTagFromSnapshot(id: string, tag: string) {
  const dir = getSnapshotDir();
  const metaPath = path.join(dir, (id.startsWith('env-') ? id : `env-${id}`) + '.json');
  
  if (!(await fs.pathExists(metaPath))) {
    throw new Error(`Snapshot metadata not found: ${metaPath}`);
  }
  
  const meta = await fs.readJson(metaPath);
  
  // Remove tag if it exists
  if (meta.tags && meta.tags.includes(tag)) {
    meta.tags = meta.tags.filter((t: string) => t !== tag);
    await fs.writeJson(metaPath, meta, { spaces: 2 });
    console.log(`Removed tag '${tag}' from snapshot ${id}`);
  } else {
    console.log(`Tag '${tag}' does not exist on snapshot ${id}`);
  }
}

export async function listSnapshotsByTag(tag: string) {
  const dir = getSnapshotDir();
  await fs.ensureDir(dir);
  const files = (await fs.readdir(dir)).filter((f: string) => f.endsWith('.json')).sort();
  
  if (files.length === 0) {
    console.log('No snapshots found.');
    return;
  }
  
  let foundSnapshots = false;
  
  for (const metaFile of files) {
    const meta = await fs.readJson(path.join(dir, metaFile));
    const id = metaFile.replace(/\.json$/, '');
    
    // Check if the snapshot has the specified tag
    if (meta.tags && meta.tags.includes(tag)) {
      foundSnapshots = true;
      const desc = meta.description ? ` - ${meta.description}` : '';
      const user = meta.user ? ` | user: ${meta.user}` : '';
      const host = meta.hostname ? ` | host: ${meta.hostname}` : '';
      const git = meta.git && meta.git.hash ? ` | git: ${meta.git.hash.substring(0,7)}@${meta.git.branch}` : '';
      const tags = meta.tags ? ` | tags: ${meta.tags.join(', ')}` : '';
      console.log(`${id}${desc}${user}${host}${git}${tags}`);
    }
  }
  
  if (!foundSnapshots) {
    console.log(`No snapshots found with tag '${tag}'.`);
  }
}
