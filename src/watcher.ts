import * as chokidar from 'chokidar';
import * as path from 'path';
import { snapshot } from './core';

const ENV_FILE = '.env';

export function startWatcher() {
  const envPath = path.resolve(process.cwd(), ENV_FILE);
  const watcher = chokidar.watch(envPath, { persistent: true });

  watcher.on('change', async () => {
    console.log('.env file changed, creating snapshot...');
    await snapshot();
  });

  console.log('env-snap watcher started. Monitoring .env for changes.');
}
