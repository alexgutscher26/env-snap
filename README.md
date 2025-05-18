# env-snapper

[![npm version](https://img.shields.io/npm/v/env-snapper.svg)](https://www.npmjs.com/package/env-snapper)
[![npm downloads](https://img.shields.io/npm/dm/env-snapper.svg)](https://www.npmjs.com/package/env-snapper)
[![license](https://img.shields.io/npm/l/env-snapper.svg)](https://github.com/madajoe6969/env-snapper/blob/main/LICENSE)

> **Security Note:**
> It is strongly recommended to add `.env-snapshots/` to your `.gitignore` to avoid accidentally committing sensitive environment history to your repository.

Automatically snapshots .env changes and lets you revert to previous environment variable states.

## Features
- Snapshots `.env` file changes automatically
- Comprehensive metadata collection
- Configurable snapshot directories
- File-based snapshot storage
- Hook system for post-snapshot actions
- Error handling and validation
- Progress tracking
- TypeScript support

## Installation

```bash
npm install -D env-snapper
```

## Usage

```bash
# Create a snapshot
npx env-snapper snapshot

# List snapshots
npx env-snapper list

# Revert to a specific snapshot
npx env-snapper revert <snapshot-id>
```

## Configuration

Create a `env-snap.config.json` file in your project root:

```json
{
  "snapshotDir": "path/to/snapshots",
  "files": [
    ".env",
    ".env.local"
  ],
  "hooks": [
    {
      "type": "shell",
      "command": "echo Snapshot created: $SNAPSHOT_ID"
    }
  ]
}
```

## License

MIT
- List, view, and revert to previous environment variable states
- CLI tool for easy usage
- Add descriptions to snapshots
- Auto-prune old snapshots to keep only the latest N
- Preview changes before restoring a snapshot

## Usage
```
npm install -g env-snap

# Initialize env-snap in your project
npx env-snap init

# Manually snapshot current .env
npx env-snap snapshot

# List all snapshots
npx env-snap list

# Revert to a previous snapshot
npx env-snap revert <snapshot-id>

# Show diff between snapshots or with current .env
npx env-snap diff <snapshot-id>            # Compare with previous snapshot
npx env-snap diff <snapshot-id> --current  # Compare with current .env

# Watch .env for changes and snapshot automatically
npx env-snap watch

# Add a description to a snapshot (after creation)
npx env-snap desc <snapshot-id> "Your description here"

# Example: create a snapshot with a description
npx env-snap snapshot --desc "Added Sentry config and removed Stripe keys"

# Prune old snapshots, keeping only the latest 5 (default)
npx env-snap prune

# Prune and keep only the latest N snapshots (e.g., 10)
npx env-snap prune 10

# Preview changes before restoring a snapshot
npx env-snap preview <snapshot-id>
```

## How it works
- Snapshots are stored in `.env-snapshots/` in your project directory (configurable).
- Each snapshot is named with a timestamp or unique ID.
- Descriptions can be added at creation (`--desc`) or later (`desc` command).
- `list` shows snapshot descriptions if present.
- `revert` prints the snapshot description if available.
- File watcher can automatically snapshot on changes (optional).
- All commands respect your config file if present.

## Configuration

You can add an `env-snap.config.json` file to your project root to customize behavior:

```json
{
  "snapshotDir": ".env-snapshots", // Where to store snapshots
  "files": [".env", ".env.local"]
}
```

If not specified, defaults are used. All commands (snapshot, revert, diff, preview, prune, watch, etc.) will respect these settings.

---

## Export / Import Snapshots

You can export all snapshots to a zip file and import them into another project or machine:

- **Export all snapshots:**
  ```sh
  npx env-snap export my-snapshots.zip
  ```
- **Import snapshots from a zip file:**
  ```sh
  npx env-snap import my-snapshots.zip
  ```

This is useful for sharing environment history, moving between machines, or backing up your snapshot archive.

---

## Git Integration

You can commit, push, pull, tag, and run hooks on your snapshot history directly from env-snap:

- **Commit all snapshot changes:**
  ```sh
  npx env-snap git-commit -m "env-snap: update"
  ```
  (If no message is provided, a default message is used.)

- **View git log for snapshots:**
  ```sh
  npx env-snap git-log
  ```

- **Push snapshots and tags to remote:**
  ```sh
  npx env-snap push
  ```

- **Pull snapshots and tags from remote:**
  ```sh
  npx env-snap pull
  ```

### Hooks & Notifications

env-snap supports running hooks and sending notifications after each snapshot. You can use:
- **Shell hooks** (run local commands)
- **Webhooks** (POST to any URL)
- **Slack** (send to a Slack channel)
- **Discord** (send to a Discord channel)
- **Teams** (send to a Microsoft Teams channel)

Add a `hooks` array to your `env-snap.config.json`:

```json
"hooks": [
  {
    "type": "shell",
    "command": "echo 'Snapshot $SNAPSHOT_ID taken by $USER on $HOST' >> .env-snapshots/hook.log"
  },
  {
    "type": "webhook",
    "url": "https://example.com/webhook",
    "body": {
      "text": "Env snapshot $SNAPSHOT_ID taken by $USER on $HOST"
    }
  },
  {
    "type": "slack",
    "webhook": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
    "message": "Env snapshot $SNAPSHOT_ID taken by $USER on $HOST"
  },
  {
    "type": "discord",
    "webhook": "https://discord.com/api/webhooks/XXX/YYY",
    "content": "Env snapshot $SNAPSHOT_ID taken by $USER on $HOST"
  },
  {
    "type": "teams",
    "webhook": "https://outlook.office.com/webhook/XXX/YYY/ZZZ",
    "text": "Env snapshot $SNAPSHOT_ID taken by $USER on $HOST"
  }
]
```

You can use `$SNAPSHOT_ID`, `$USER`, and `$HOST` in your messages for dynamic info.

---

### Advanced Git Automation

You can enable automatic git actions in your `env-snap.config.json`:

```json
{
  "autoGitCommit": true,        // Auto-commit after each snapshot
  "autoPush": true,             // Auto-push after each commit
  "branch": "main",            // Switch to this branch before commit
  "tag": true,                  // Tag each snapshot commit
  "commitHooks": [              // Run these shell commands after commit/push
    "echo 'Snapshot taken!' > .env-snapshots/hook.log"
  ]
}
```

Every snapshot will:
- Switch to the specified branch (if set)
- Commit changes in `.env-snapshots`
- Tag the commit (if enabled)
- Push to the remote (if enabled)
- Run any commit hooks (e.g., notifications, scripts)

This allows you to fully automate backup, sync, and audit of your environment history.

---

## Author

- Alex G. 

This is an open-source project. Contributions welcome!
