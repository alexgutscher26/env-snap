import * as fs from 'fs-extra';
import * as path from 'path';
import { getSnapshotDir, getSnapshotGroup, getSnapshotFiles } from './core';
import { diffLines, createTwoFilesPatch } from 'diff';
import chalk from 'chalk';

export async function showDiff(id: string, compareWithCurrent = true) {
  const dir = getSnapshotDir();
  let group;
  try {
    group = await getSnapshotGroup(id);
  } catch (e: any) {
    console.error(e.message);
    return;
  }
  let anyDiff = false;
  for (const file of group.files) {
    const snapPath = path.join(dir, `${group.id}__${file}`);
    if (!fs.existsSync(snapPath)) {
      console.error(`Snapshot file not found: ${snapPath}`);
      continue;
    }
    const snapContent = (await fs.readFile(snapPath)).toString();
    let currentContent = '';
    try {
      currentContent = (await fs.readFile(path.resolve(process.cwd(), file))).toString();
    } catch {
      // File might not exist currently
    }
    const patch = createTwoFilesPatch(
      `${file} (current)`,
      `${file} (snapshot ${group.id})`,
      currentContent,
      snapContent,
      '',
      ''
    );
    const lines = patch.split('\n');
    let hasDiff = false;
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        process.stdout.write(chalk.green(line) + '\n');
        hasDiff = true;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        process.stdout.write(chalk.red(line) + '\n');
        hasDiff = true;
      } else if (line.startsWith('@@')) {
        process.stdout.write(chalk.cyan(line) + '\n');
        hasDiff = true;
      } else {
        process.stdout.write(line + '\n');
      }
    }
    if (!hasDiff) {
      console.log(`No differences found for ${file}.`);
    } else {
      anyDiff = true;
    }
    console.log();
  }
  if (!anyDiff) {
    console.log('No differences found in any files.');
  }
}
