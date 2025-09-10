import * as fs from 'fs-extra';
import * as path from 'path';
import { getSnapshotDir } from './core';

interface AnalyticsEvent {
  timestamp: string;
  command: string;
  userId?: string;
  metadata?: Record<string, any>;
}

class Analytics {
  private analyticsFile: string;
  private enabled: boolean;

  constructor() {
    this.analyticsFile = path.join(getSnapshotDir(), 'analytics.json');
    this.enabled = false; // Disabled by default
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  async track(command: string, metadata?: Record<string, any>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const event: AnalyticsEvent = {
      timestamp: new Date().toISOString(),
      command,
      metadata
    };

    try {
      // Read existing analytics data
      let analyticsData: AnalyticsEvent[] = [];
      if (await fs.pathExists(this.analyticsFile)) {
        analyticsData = await fs.readJson(this.analyticsFile);
      }

      // Add new event
      analyticsData.push(event);

      // Keep only the last 1000 events to prevent file from growing too large
      if (analyticsData.length > 1000) {
        analyticsData = analyticsData.slice(-1000);
      }

      // Write back to file
      await fs.writeJson(this.analyticsFile, analyticsData, { spaces: 2 });
    } catch (error) {
      // Silently fail to avoid disrupting normal operation
      console.debug('Failed to track analytics event:', error);
    }
  }

  async getReport(): Promise<{ 
    totalEvents: number; 
    commands: Record<string, number>;
    recentEvents: AnalyticsEvent[];
  }> {
    if (!await fs.pathExists(this.analyticsFile)) {
      return {
        totalEvents: 0,
        commands: {},
        recentEvents: []
      };
    }

    const analyticsData: AnalyticsEvent[] = await fs.readJson(this.analyticsFile);
    
    // Count commands
    const commands: Record<string, number> = {};
    for (const event of analyticsData) {
      commands[event.command] = (commands[event.command] || 0) + 1;
    }

    return {
      totalEvents: analyticsData.length,
      commands,
      recentEvents: analyticsData.slice(-10) // Last 10 events
    };
  }
}

// Export singleton instance
export const analytics = new Analytics();

export default Analytics;