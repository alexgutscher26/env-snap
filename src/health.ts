import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import chalk from 'chalk';
import { getSnapshotDir, getSnapshotGroup } from './core';

interface HealthCheckResult {
  id: string;
  status: 'healthy' | 'corrupted' | 'missing';
  issues: string[];
  fileCount: number;
}

export async function verifySnapshotIntegrity(id: string): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    id,
    status: 'healthy',
    issues: [],
    fileCount: 0
  };
  
  try {
    const group = await getSnapshotGroup(id);
    result.fileCount = group.files.length;
    
    // Verify each file in the snapshot
    for (const file of group.files) {
      const snapPath = path.join(getSnapshotDir(), `${group.id}__${file}`);
      
      // Check if file exists
      if (!fs.existsSync(snapPath)) {
        result.status = 'missing';
        result.issues.push(`Missing snapshot file: ${file}`);
        continue;
      }
      
      // Calculate file hash and compare with metadata
      const fileContent = await fs.readFile(snapPath);
      const currentHash = crypto.createHash('sha256').update(fileContent).digest('hex');
      
      const expectedHash = group.meta.stats.files.find((f: any) => f.name === file)?.hash;
      
      if (expectedHash && currentHash !== expectedHash) {
        result.status = 'corrupted';
        result.issues.push(`Hash mismatch for ${file}: expected ${expectedHash}, got ${currentHash}`);
      }
    }
    
    return result;
  } catch (error: any) {
    return {
      id,
      status: 'corrupted',
      issues: [error.message],
      fileCount: 0
    };
  }
}

export async function verifyAllSnapshots(): Promise<HealthCheckResult[]> {
  const dir = getSnapshotDir();
  const files = (await fs.readdir(dir)).filter((f: string) => f.endsWith('.json')).sort();
  
  const results: HealthCheckResult[] = [];
  
  for (const metaFile of files) {
    const id = metaFile.replace(/\.json$/, '');
    const result = await verifySnapshotIntegrity(id);
    results.push(result);
  }
  
  return results;
}

export async function runHealthCheck(id?: string): Promise<void> {
  if (id) {
    // Check specific snapshot
    const result = await verifySnapshotIntegrity(id);
    printHealthCheckResult(result);
  } else {
    // Check all snapshots
    const results = await verifyAllSnapshots();
    
    console.log(chalk.bold(`Health check for ${results.length} snapshots:`));
    
    let healthyCount = 0;
    let corruptedCount = 0;
    let missingCount = 0;
    
    for (const result of results) {
      switch (result.status) {
        case 'healthy':
          healthyCount++;
          break;
        case 'corrupted':
          corruptedCount++;
          break;
        case 'missing':
          missingCount++;
          break;
      }
      
      if (result.status !== 'healthy') {
        printHealthCheckResult(result);
      }
    }
    
    console.log(chalk.green(`\nHealthy: ${healthyCount}`));
    console.log(chalk.yellow(`Corrupted: ${corruptedCount}`));
    console.log(chalk.red(`Missing: ${missingCount}`));
  }
}

function printHealthCheckResult(result: HealthCheckResult): void {
  const statusColor = 
    result.status === 'healthy' ? chalk.green :
    result.status === 'corrupted' ? chalk.red :
    chalk.yellow;
    
  console.log(`${statusColor(result.status.toUpperCase())} - Snapshot: ${result.id} (${result.fileCount} files)`);
  
  if (result.issues.length > 0) {
    for (const issue of result.issues) {
      console.log(`  - ${chalk.gray(issue)}`);
    }
  }
}