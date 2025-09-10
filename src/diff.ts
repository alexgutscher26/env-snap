import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { diffLines, Change } from 'diff';
import { getSnapshotDir, getSnapshotGroup } from './core';

interface DiffOptions {
  ignore?: string[];
  current?: boolean;
}

export async function showDiff(id: string, options: DiffOptions = {}) {
  const dir = getSnapshotDir();
  let group;
  
  try {
    group = await getSnapshotGroup(id);
  } catch (e: any) {
    console.error(e.message);
    return;
  }
  
  const ignoreVars = options.ignore ? options.ignore.map(v => v.trim()) : [];
  
  for (const file of group.files) {
    const snapPath = path.join(dir, `${group.id}__${file}`);
    if (!fs.existsSync(snapPath)) {
      console.error(`Snapshot file not found: ${snapPath}`);
      continue;
    }
    
    let comparePath;
    if (options.current) {
      comparePath = path.resolve(process.cwd(), file);
    } else {
      // Find the previous snapshot
      const allSnapshots = (await fs.readdir(dir))
        .filter((f: string) => f.startsWith('env-') && f.endsWith(`__${file}`))
        .sort()
        .reverse();
      
      const currentIndex = allSnapshots.findIndex((f: string) => f.startsWith(group.id));
      if (currentIndex === -1 || currentIndex === allSnapshots.length - 1) {
        console.log('No previous snapshot to compare with.');
        return;
      }
      
      const prevSnapshot = allSnapshots[currentIndex + 1];
      comparePath = path.join(dir, prevSnapshot);
    }
    
    if (!fs.existsSync(comparePath)) {
      console.error(`Comparison file not found: ${comparePath}`);
      continue;
    }
    
    const snapContent = await fs.readFile(snapPath, 'utf8');
    const compareContent = await fs.readFile(comparePath, 'utf8');
    
    const filteredSnapContent = ignoreVars.length > 0 ? filterVariables(snapContent, ignoreVars) : snapContent;
    const filteredCompareContent = ignoreVars.length > 0 ? filterVariables(compareContent, ignoreVars) : compareContent;
    
    const diff = diffLines(filteredCompareContent, filteredSnapContent);
    
    if (group.files.length > 1) {
      console.log(chalk.bold(`\n--- Diff for ${file} ---`));
    }
    
    diff.forEach((part: Change) => {
      if (part.added) {
        process.stdout.write(chalk.green(`+${part.value}`));
      } else if (part.removed) {
        process.stdout.write(chalk.red(`-${part.value}`));
      } else {
        process.stdout.write(chalk.gray(part.value));
      }
    });
    
    // Highlight sensitive variables
    if (!options.ignore || options.ignore.length === 0) {
      highlightSensitiveVariables(diff);
    }
  }
}

function filterVariables(content: string, ignoreVars: string[]): string {
  const lines = content.split('\n');
  return lines
    .filter(line => {
      const varName = line.split('=')[0];
      return !ignoreVars.includes(varName);
    })
    .join('\n');
}

function highlightSensitiveVariables(diff: Change[]) {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /key/i,
    /token/i,
    /api[_-]?key/i,
    /auth/i
  ];
  
  diff.forEach(part => {
    if (part.added || part.removed) {
      const lines = part.value.split('\n');
      lines.forEach(line => {
        const varName = line.split('=')[0];
        if (sensitivePatterns.some(pattern => pattern.test(varName))) {
          console.log(chalk.yellow(`[SENSITIVE] ${line}`));
        }
      });
    }
  });
}