import { exec } from 'child_process';
import * as util from 'util';
const execAsync = util.promisify(exec);

import * as fs from 'fs-extra';

export async function gitCommitSnapshot(message: string = 'env-snap: snapshot update', config?: any, tagName?: string) {
  try {
    // Switch branch if specified
    if (config?.branch) {
      await execAsync(`git checkout ${config.branch}`);
    }
    await execAsync('git add .env-snapshots');
    await execAsync(`git commit -m "${message}"`);
    console.log('Committed .env-snapshots to git.');
    if (config?.tag && tagName) {
      await execAsync(`git tag ${tagName}`);
      console.log(`Tagged commit with: ${tagName}`);
    }
    if (config?.autoPush) {
      await execAsync('git push');
      if (config?.tag && tagName) {
        await execAsync('git push --tags');
      }
      console.log('Pushed commit to remote.');
    }
    if (Array.isArray(config?.commitHooks)) {
      for (const hookCmd of config.commitHooks) {
        await execAsync(hookCmd);
        console.log(`Ran commit hook: ${hookCmd}`);
      }
    }
  } catch (e: any) {
    if (e.stderr && e.stderr.includes('nothing to commit')) {
      console.log('No changes to commit.');
    } else {
      console.error('Git commit/push failed:', e.stderr || e.message);
    }
  }
}

export async function runPostSnapshotGitIntegration(message: string, id: string, config: any) {
  const tagName = config.tag ? `env-snap-${id}` : undefined;
  await gitCommitSnapshot(message, config, tagName);
}

export async function gitLogSnapshots() {
  try {
    const { stdout } = await execAsync('git log -- .env-snapshots');
    console.log(stdout);
  } catch (e: any) {
    console.error('Git log failed:', e.stderr || e.message);
  }
}

export async function gitPushSnapshots() {
  try {
    await execAsync('git push');
    await execAsync('git push --tags');
    console.log('Pushed .env-snapshots branch and tags to remote.');
  } catch (e: any) {
    console.error('Git push failed:', e.stderr || e.message);
  }
}

export async function gitPullSnapshots() {
  try {
    await execAsync('git pull');
    await execAsync('git fetch --tags');
    console.log('Pulled .env-snapshots branch and tags from remote.');
  } catch (e: any) {
    console.error('Git pull failed:', e.stderr || e.message);
  }
}
