import * as fs from 'fs-extra';
import * as path from 'path';

export interface Plugin {
  name: string;
  version: string;
  description: string;
  commands?: PluginCommand[];
  hooks?: PluginHook[];
}

export interface PluginCommand {
  name: string;
  description: string;
  action: (args: any[]) => Promise<void>;
}

export interface PluginHook {
  name: string;
  action: (context: any) => Promise<void>;
}

class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginDir: string;

  constructor() {
    this.pluginDir = path.join(process.cwd(), 'env-snap-plugins');
  }

  async loadPlugins(): Promise<void> {
    // Create plugins directory if it doesn't exist
    await fs.ensureDir(this.pluginDir);
    
    // Load all plugins from the plugins directory
    const pluginDirs = await fs.readdir(this.pluginDir);
    
    for (const pluginDir of pluginDirs) {
      const pluginPath = path.join(this.pluginDir, pluginDir);
      const stat = await fs.stat(pluginPath);
      
      if (stat.isDirectory()) {
        await this.loadPlugin(pluginPath);
      }
    }
  }

  private async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Look for plugin manifest
      const manifestPath = path.join(pluginPath, 'plugin.json');
      if (!(await fs.pathExists(manifestPath))) {
        console.warn(`Plugin manifest not found in ${pluginPath}`);
        return;
      }

      const manifest = await fs.readJson(manifestPath);
      
      // Validate manifest
      if (!manifest.name || !manifest.version) {
        console.warn(`Invalid plugin manifest in ${pluginPath}`);
        return;
      }

      // Try to load the plugin module
      const modulePath = path.join(pluginPath, 'index.js');
      if (!(await fs.pathExists(modulePath))) {
        console.warn(`Plugin module not found in ${pluginPath}`);
        return;
      }

      // Load the plugin
      const pluginModule = await import(modulePath);
      const plugin: Plugin = {
        ...manifest,
        ...pluginModule
      };

      this.plugins.set(manifest.name, plugin);
      console.log(`Loaded plugin: ${manifest.name} v${manifest.version}`);
    } catch (error) {
      console.error(`Failed to load plugin from ${pluginPath}:`, error);
    }
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  async executeCommand(pluginName: string, commandName: string, args: any[]): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    if (!plugin.commands) {
      throw new Error(`Plugin ${pluginName} has no commands`);
    }

    const command = plugin.commands.find(cmd => cmd.name === commandName);
    if (!command) {
      throw new Error(`Command ${commandName} not found in plugin ${pluginName}`);
    }

    await command.action(args);
  }

  async runHook(hookName: string, context: any): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks) {
        const hook = plugin.hooks.find(h => h.name === hookName);
        if (hook) {
          try {
            await hook.action(context);
          } catch (error) {
            console.error(`Hook ${hookName} in plugin ${plugin.name} failed:`, error);
          }
        }
      }
    }
  }
}

// Export singleton instance
export const pluginManager = new PluginManager();

export default PluginManager;