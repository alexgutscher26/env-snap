import * as fs from 'fs-extra';
import * as path from 'path';
import { getSnapshotDir } from './core';
import archiver from 'archiver';
import unzipper from 'unzipper';

export async function exportSnapshots(outputZip: string) {
  const dir = getSnapshotDir();
  if (!fs.existsSync(dir)) {
    console.error('No snapshots to export.');
    return;
  }
  const files = await fs.readdir(dir);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = fs.createWriteStream(outputZip);
  archive.pipe(output);
  for (const file of files) {
    archive.file(path.join(dir, file), { name: file });
  }
  await archive.finalize();
  console.log(`Exported all snapshots to ${outputZip}`);
}

export async function importSnapshots(inputZip: string) {
  const dir = getSnapshotDir();
  await fs.ensureDir(dir);
  const stream = fs.createReadStream(inputZip).pipe(unzipper.Extract({ path: dir }));
  await new Promise((resolve, reject) => {
    stream.on('close', resolve);
    stream.on('error', reject);
  });
  console.log(`Imported snapshots from ${inputZip}`);
}
