#!/usr/bin/env node
import { Command } from 'commander';
import { init, snapshot, list, revert } from './core';
import { pluginManager } from './plugins';
import { analytics } from './analytics';

const program = new Command();

program
  .name('env-snap')
  .description('Automatically snapshots .env changes and lets you revert to previous environment variable states.')
  .version('0.1.0');

// Load plugins
(async () => {
  await pluginManager.loadPlugins();
  
  // Register plugin commands
  for (const plugin of pluginManager.getAllPlugins()) {
    if (plugin.commands) {
      for (const command of plugin.commands) {
        program
          .command(`plugin:${plugin.name}:${command.name}`)
          .description(`[${plugin.name}] ${command.description}`)
          .action(async (...args) => {
            await analytics.track(`plugin:${plugin.name}:${command.name}`);
            await pluginManager.executeCommand(plugin.name, command.name, args);
          });
      }
    }
  }
})();

// Track command execution
program.hook('preAction', async (thisCommand, actionCommand) => {
  await analytics.track(actionCommand.name(), {
    args: actionCommand.args
  });
});

program
  .command('init')
  .description('Initialize env-snap in your project')
  .action(async () => {
    await analytics.track('init');
    await init();
  });

program
  .command('snapshot')
  .description('Manually snapshot the current .env file')
  .option('-d, --desc <description>', 'Description for this snapshot')
  .option('-t, --tags <tags>', 'Comma-separated tags for this snapshot')
  .action(async (options) => {
    await analytics.track('snapshot', { hasDescription: !!options.desc, hasTags: !!options.tags });
    const core = await import('./core');
    const snapshotId = await core.snapshot(options.desc);
    
    // Add tags if provided
    if (options.tags) {
      const tags = options.tags.split(',').map((tag: string) => tag.trim());
      for (const tag of tags) {
        await core.addTagToSnapshot(snapshotId, tag);
      }
    }
  });

program
  .command('list')
  .description('List all .env snapshots')
  .option('-t, --tag <tag>', 'List snapshots with a specific tag')
  .action(async (options) => {
    await analytics.track('list', { hasTagFilter: !!options.tag });
    const core = await import('./core');
    if (options.tag) {
      await core.listSnapshotsByTag(options.tag);
    } else {
      await core.list();
    }
  });

program
  .command('revert <id>')
  .description('Revert .env to the specified snapshot ID')
  .action(async (id) => {
    await analytics.track('revert', { snapshotId: id });
    await revert(id);
  });

program
  .command('watch')
  .description('Start watching .env for changes and snapshot automatically')
  .action(async () => {
    await analytics.track('watch');
    const watcher = await import('./watcher');
    watcher.startWatcher();
  });

program
  .command('diff <id>')
  .option('-c, --current', 'Compare with current .env instead of previous snapshot')
  .option('-i, --ignore <variables>', 'Comma-separated list of variables to ignore in diff')
  .description('Show diff between snapshots or with current .env')
  .action(async (id, options) => {
    await analytics.track('diff', { 
      snapshotId: id, 
      hasCurrent: !!options.current, 
      hasIgnore: !!options.ignore 
    });
    const diff = await import('./diff');
    const diffOptions = {
      current: options.current,
      ignore: options.ignore ? options.ignore.split(',').map((v: string) => v.trim()) : undefined
    };
    await diff.showDiff(id, diffOptions);
  });

program
  .command('desc <id> <description>')
  .description('Add or edit the description for a snapshot')
  .action(async (id, description) => {
    await analytics.track('desc', { snapshotId: id });
    const core = await import('./core');
    await core.setSnapshotDescription(id, description);
  });

program
  .command('prune [keep]')
  .description('Delete old snapshots, keeping only the latest N (default: 5)')
  .action(async (keep) => {
    await analytics.track('prune', { keep: keep || 5 });
    const core = await import('./core');
    await core.pruneSnapshots(keep ? parseInt(keep, 10) : 5);
  });

program
  .command('preview <id>')
  .description('Preview changes that would be made by restoring a snapshot')
  .action(async (id) => {
    await analytics.track('preview', { snapshotId: id });
    const preview = await import('./preview');
    await preview.previewRestore(id);
  });

program
  .command('export <outputZip>')
  .description('Export all snapshots as a zip file')
  .option('-e, --encrypt', 'Encrypt the exported zip file')
  .option('-p, --password <password>', 'Password for encryption')
  .action(async (outputZip, options) => {
    await analytics.track('export', { 
      hasEncrypt: !!options.encrypt, 
      hasPassword: !!options.password 
    });
    const exp = await import('./exportImport');
    await exp.exportSnapshots(outputZip, options.encrypt, options.password);
  });

program
  .command('import <inputZip>')
  .description('Import snapshots from a zip file')
  .option('-d, --decrypt', 'Decrypt the imported zip file')
  .option('-p, --password <password>', 'Password for decryption')
  .action(async (inputZip, options) => {
    await analytics.track('import', { 
      hasDecrypt: !!options.decrypt, 
      hasPassword: !!options.password 
    });
    const exp = await import('./exportImport');
    await exp.importSnapshots(inputZip, options.decrypt, options.password);
  });

program
  .command('git-commit')
  .description('Commit all snapshot changes to git')
  .option('-m, --message <msg>', 'Git commit message')
  .action(async (opts) => {
    await analytics.track('git-commit', { hasMessage: !!opts.message });
    const git = await import('./git');
    await git.gitCommitSnapshot(opts.message);
  });

program
  .command('git-log')
  .description('Show git log for .env-snapshots')
  .action(async () => {
    await analytics.track('git-log');
    const git = await import('./git');
    await git.gitLogSnapshots();
  });

program
  .command('push')
  .description('Push .env-snapshots branch/tags to remote')
  .action(async () => {
    await analytics.track('push');
    const git = await import('./git');
    await git.gitPushSnapshots();
  });

program
  .command('pull')
  .description('Pull .env-snapshots from remote and update local snapshots')
  .action(async () => {
    await analytics.track('pull');
    const git = await import('./git');
    await git.gitPullSnapshots();
  });

program
  .command('info <snapshotId>')
  .description('Show detailed metadata for a snapshot')
  .action(async (snapshotId) => {
    await analytics.track('info', { snapshotId });
    const core = await import('./core');
    await core.snapshotInfo(snapshotId);
  });

program
  .command('tag <snapshot-id> <tag>')
  .description('Add a tag to a snapshot')
  .action(async (snapshotId, tag) => {
    await analytics.track('tag', { snapshotId, tag });
    const core = await import('./core');
    await core.addTagToSnapshot(snapshotId, tag);
  });

program
  .command('untag <snapshot-id> <tag>')
  .description('Remove a tag from a snapshot')
  .action(async (snapshotId, tag) => {
    await analytics.track('untag', { snapshotId, tag });
    const core = await import('./core');
    await core.removeTagFromSnapshot(snapshotId, tag);
  });

program
  .command('verify [snapshotId]')
  .description('Verify the integrity of snapshots')
  .action(async (snapshotId) => {
    await analytics.track('verify', { hasSnapshotId: !!snapshotId });
    const health = await import('./health');
    await health.runHealthCheck(snapshotId);
  });

program
  .command('cache-clear')
  .description('Clear the cache')
  .action(async () => {
    await analytics.track('cache-clear');
    const cacheModule = await import('./cache');
    cacheModule.cache.clear();
    console.log('Cache cleared');
  });

program
  .command('analytics-report')
  .description('Show analytics report')
  .action(async () => {
    await analytics.track('analytics-report');
    const report = await analytics.getReport();
    
    console.log('Analytics Report:');
    console.log('=================');
    console.log(`Total Events: ${report.totalEvents}`);
    console.log('');
    console.log('Command Usage:');
    
    const sortedCommands = Object.entries(report.commands)
      .sort((a, b) => b[1] - a[1]);
      
    for (const [command, count] of sortedCommands) {
      console.log(`  ${command}: ${count}`);
    }
    
    console.log('');
    console.log('Recent Events:');
    for (const event of report.recentEvents) {
      console.log(`  ${event.timestamp} - ${event.command}`);
    }
  });

program.parse(process.argv);