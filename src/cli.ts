#!/usr/bin/env node
import { Command } from 'commander';
import { init, snapshot, list, revert } from './core';

const program = new Command();

program
  .name('env-snap')
  .description('Automatically snapshots .env changes and lets you revert to previous environment variable states.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize env-snap in your project')
  .action(init);

program
  .command('snapshot')
  .description('Manually snapshot the current .env file')
  .option('-d, --desc <description>', 'Description for this snapshot')
  .action((options) => {
    snapshot(options.desc);
  });

program
  .command('list')
  .description('List all .env snapshots')
  .action(list);

program
  .command('revert <id>')
  .description('Revert .env to the specified snapshot ID')
  .action(revert);

program
  .command('watch')
  .description('Start watching .env for changes and snapshot automatically')
  .action(async () => {
    const watcher = await import('./watcher');
    watcher.startWatcher();
  });

program
  .command('diff <id>')
  .option('-c, --current', 'Compare with current .env instead of previous snapshot')
  .description('Show diff between snapshots or with current .env')
  .action(async (id, options) => {
    const diff = await import('./diff');
    await diff.showDiff(id, options.current);
  });

program
  .command('desc <id> <description>')
  .description('Add or edit the description for a snapshot')
  .action(async (id, description) => {
    const core = await import('./core');
    await core.setSnapshotDescription(id, description);
  });

program
  .command('prune [keep]')
  .description('Delete old snapshots, keeping only the latest N (default: 5)')
  .action(async (keep) => {
    const core = await import('./core');
    await core.pruneSnapshots(keep ? parseInt(keep, 10) : 5);
  });

program
  .command('preview <id>')
  .description('Preview changes that would be made by restoring a snapshot')
  .action(async (id) => {
    const preview = await import('./preview');
    await preview.previewRestore(id);
  });

program
  .command('export <outputZip>')
  .description('Export all snapshots as a zip file')
  .action(async (outputZip) => {
    const exp = await import('./exportImport');
    await exp.exportSnapshots(outputZip);
  });

program
  .command('import <inputZip>')
  .description('Import snapshots from a zip file')
  .action(async (inputZip) => {
    const exp = await import('./exportImport');
    await exp.importSnapshots(inputZip);
  });

program
  .command('git-commit')
  .description('Commit all snapshot changes to git')
  .option('-m, --message <msg>', 'Git commit message')
  .action(async (opts) => {
    const git = await import('./git');
    await git.gitCommitSnapshot(opts.message);
  });

program
  .command('git-log')
  .description('Show git log for .env-snapshots')
  .action(async () => {
    const git = await import('./git');
    await git.gitLogSnapshots();
  });

program
  .command('push')
  .description('Push .env-snapshots branch/tags to remote')
  .action(async () => {
    const git = await import('./git');
    await git.gitPushSnapshots();
  });

program
  .command('pull')
  .description('Pull .env-snapshots from remote and update local snapshots')
  .action(async () => {
    const git = await import('./git');
    await git.gitPullSnapshots();
  });

program
  .command('info <snapshotId>')
  .description('Show detailed metadata for a snapshot')
  .action(async (snapshotId) => {
    const core = await import('./core');
    await core.snapshotInfo(snapshotId);
  });

program.parse(process.argv);
