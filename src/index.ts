/**
 * ContextClaw - OpenClaw Plugin
 * Session and context management
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ContextServer, ServerConfig } from './server';
import { SessionAnalyzer } from './analyzers/session-analyzer';

// Global server instance
let serverInstance: ContextServer | null = null;

// Default configuration
const DEFAULT_CONFIG: ServerConfig = {
  port: 18797,
  openclawHome: path.join(os.homedir(), '.openclaw'),
};

// Config file path
const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'context-tracker', 'config.json');

/**
 * Load or create configuration
 */
function loadConfig(): ServerConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.warn('[ContextClaw] Failed to load config, using defaults');
  }
  
  return DEFAULT_CONFIG;
}

/**
 * Save configuration
 */
function saveConfig(config: ServerConfig): void {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('[ContextClaw] Failed to save config:', error);
  }
}

/**
 * Start the context server
 */
async function startServer(config: ServerConfig): Promise<void> {
  if (serverInstance) {
    console.log('[ContextClaw] Server already running');
    return;
  }
  
  serverInstance = new ContextServer(config);
  await serverInstance.start();
}

/**
 * Stop the context server
 */
async function stopServer(): Promise<void> {
  if (serverInstance) {
    await serverInstance.stop();
    serverInstance = null;
  }
}

/**
 * Main plugin export
 */
export default function ContextClawPlugin(context: any) {
  console.log('[ContextClaw] Plugin loaded');
  
  const config = loadConfig();
  const analyzer = new SessionAnalyzer(config.openclawHome);
  
  // Auto-start server on plugin load
  startServer(config).catch(err => {
    console.error('[ContextClaw] Failed to start server:', err);
  });
  
  return {
    name: 'contextclaw',
    version: '1.0.0',
    
    // Register CLI commands
    commands: {
      setup: async () => {
        const inquirer = await import('inquirer');
        const chalk = await import('chalk');
        
        console.log(chalk.default.bold('\n🦞 ContextClaw Setup\n'));
        
        const answers = await inquirer.default.prompt([
          {
            type: 'number',
            name: 'port',
            message: 'Dashboard port:',
            default: config.port,
          },
          {
            type: 'input',
            name: 'openclawHome',
            message: 'OpenClaw home directory:',
            default: config.openclawHome,
          },
        ]);
        
        const newConfig = { ...config, ...answers };
        saveConfig(newConfig);
        
        console.log(chalk.default.green('\n✓ Configuration saved!'));
        console.log(chalk.default.gray(`  Port: ${newConfig.port}`));
        console.log(chalk.default.gray(`  Home: ${newConfig.openclawHome}`));
        console.log(chalk.default.yellow('\nRestart OpenClaw to apply changes.'));
      },
      
      analyze: async () => {
        const chalk = (await import('chalk')).default;
        const Table = (await import('cli-table3')).default;
        
        console.log(chalk.bold('\n📊 Session Analysis\n'));
        
        const stats = analyzer.analyzeSessions();
        
        // Summary table
        const summaryTable = new Table({
          head: [chalk.cyan('Metric'), chalk.cyan('Value')],
        });
        
        summaryTable.push(
          ['Total Sessions', stats.totalSessions.toString()],
          ['Total Messages', stats.totalMessages.toLocaleString()],
          ['Total Tokens', stats.totalTokens.toLocaleString()],
          ['Total Size', SessionAnalyzer.formatBytes(stats.totalSizeBytes)],
          ['Orphaned Sessions', chalk.yellow(stats.orphaned.length.toString())]
        );
        
        console.log(summaryTable.toString());
        
        // Largest sessions
        console.log(chalk.bold('\n📈 Largest Sessions (Top 10)\n'));
        
        const largestTable = new Table({
          head: [
            chalk.cyan('Session ID'),
            chalk.cyan('Type'),
            chalk.cyan('Size'),
            chalk.cyan('Messages'),
            chalk.cyan('Tokens')
          ],
        });
        
        for (const session of stats.bySizeDesc.slice(0, 10)) {
          largestTable.push([
            session.label || session.sessionKey.substring(0, 20),
            session.agentType,
            SessionAnalyzer.formatBytes(session.sizeBytes),
            session.messageCount.toString(),
            session.tokenCount.toLocaleString(),
          ]);
        }
        
        console.log(largestTable.toString());
        
        // Oldest sessions
        console.log(chalk.bold('\n⏰ Oldest Sessions (Top 10)\n'));
        
        const oldestTable = new Table({
          head: [
            chalk.cyan('Session ID'),
            chalk.cyan('Type'),
            chalk.cyan('Age (days)'),
            chalk.cyan('Size')
          ],
        });
        
        for (const session of stats.byAge.slice(0, 10)) {
          const ageInDays = Math.floor(
            (Date.now() - session.lastModified.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          oldestTable.push([
            session.label || session.sessionKey.substring(0, 20),
            session.agentType,
            ageInDays.toString(),
            SessionAnalyzer.formatBytes(session.sizeBytes),
          ]);
        }
        
        console.log(oldestTable.toString());
        
        // Orphaned sessions
        if (stats.orphaned.length > 0) {
          console.log(chalk.bold(`\n⚠️  Orphaned Sessions (${stats.orphaned.length})\n`));
          console.log(chalk.gray('These sessions are not in sessions.json and can be safely removed.\n'));
          
          const orphanedTable = new Table({
            head: [
              chalk.cyan('Session ID'),
              chalk.cyan('Type'),
              chalk.cyan('Size'),
              chalk.cyan('Last Modified')
            ],
          });
          
          for (const session of stats.orphaned.slice(0, 10)) {
            orphanedTable.push([
              session.sessionKey.substring(0, 20),
              session.agentType,
              SessionAnalyzer.formatBytes(session.sizeBytes),
              session.lastModified.toLocaleDateString(),
            ]);
          }
          
          console.log(orphanedTable.toString());
          
          if (stats.orphaned.length > 10) {
            console.log(chalk.gray(`\n...and ${stats.orphaned.length - 10} more\n`));
          }
          
          console.log(chalk.yellow('\nRun'), chalk.bold('openclaw contextclaw clean-orphaned'), chalk.yellow('to remove them.\n'));
        }
      },
      
      prune: async (args: any) => {
        const chalk = (await import('chalk')).default;
        const inquirer = await import('inquirer');
        
        const daysOld = args.days || 30;
        const dryRun = args.dryRun !== false; // Default to dry run
        
        console.log(chalk.bold('\n🧹 Session Pruning\n'));
        
        if (dryRun) {
          console.log(chalk.yellow('⚠️  DRY RUN MODE - No files will be deleted\n'));
        } else {
          console.log(chalk.red('⚠️  LIVE MODE - Files will be permanently deleted!\n'));
        }
        
        const result = analyzer.pruneSessions({
          daysOld,
          keepMain: true,
          keepCron: true,
          dryRun,
        });
        
        console.log(chalk.gray(`Sessions older than ${daysOld} days:`));
        console.log(chalk.green(`  ✓ Would delete: ${result.deleted.length}`));
        console.log(chalk.gray(`  - Would keep: ${result.kept.length}`));
        console.log(chalk.gray(`  - Space freed: ${SessionAnalyzer.formatBytes(result.totalBytes)}\n`));
        
        if (dryRun && result.deleted.length > 0) {
          const answers = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'proceed',
              message: 'Run prune in LIVE mode (actually delete files)?',
              default: false,
            },
          ]);
          
          if (answers.proceed) {
            console.log(chalk.red('\nDeleting sessions...\n'));
            
            const liveResult = analyzer.pruneSessions({
              daysOld,
              keepMain: true,
              keepCron: true,
              dryRun: false,
            });
            
            console.log(chalk.green(`✓ Deleted ${liveResult.deleted.length} sessions`));
            console.log(chalk.green(`✓ Freed ${SessionAnalyzer.formatBytes(liveResult.totalBytes)}\n`));
          } else {
            console.log(chalk.gray('\nAborted. No files were deleted.\n'));
          }
        }
      },
      
      'clean-orphaned': async (args: any) => {
        const chalk = (await import('chalk')).default;
        const inquirer = await import('inquirer');
        
        const dryRun = args.dryRun !== false; // Default to dry run
        
        console.log(chalk.bold('\n🗑️  Clean Orphaned Sessions\n'));
        
        if (dryRun) {
          console.log(chalk.yellow('⚠️  DRY RUN MODE - No files will be deleted\n'));
        } else {
          console.log(chalk.red('⚠️  LIVE MODE - Files will be permanently deleted!\n'));
        }
        
        const result = analyzer.cleanOrphaned(dryRun);
        
        if (result.deleted.length === 0) {
          console.log(chalk.green('✓ No orphaned sessions found!\n'));
          return;
        }
        
        console.log(chalk.gray(`Found ${result.deleted.length} orphaned sessions:`));
        console.log(chalk.gray(`  - Total size: ${SessionAnalyzer.formatBytes(result.totalBytes)}\n`));
        
        if (dryRun) {
          const answers = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'proceed',
              message: 'Delete these orphaned sessions?',
              default: false,
            },
          ]);
          
          if (answers.proceed) {
            console.log(chalk.red('\nDeleting orphaned sessions...\n'));
            
            const liveResult = analyzer.cleanOrphaned(false);
            
            console.log(chalk.green(`✓ Deleted ${liveResult.deleted.length} orphaned sessions`));
            console.log(chalk.green(`✓ Freed ${SessionAnalyzer.formatBytes(liveResult.totalBytes)}\n`));
          } else {
            console.log(chalk.gray('\nAborted. No files were deleted.\n'));
          }
        }
      },
      
      start: async () => {
        const chalk = (await import('chalk')).default;
        try {
          await startServer(config);
          console.log(chalk.green('✓ ContextClaw started'));
        } catch (error: any) {
          console.error(chalk.red('✗ Failed to start:'), error.message);
        }
      },
      
      stop: async () => {
        const chalk = (await import('chalk')).default;
        await stopServer();
        console.log(chalk.green('✓ ContextClaw stopped'));
      },
      
      status: async () => {
        const chalk = (await import('chalk')).default;
        console.log(chalk.bold('\n📊 ContextClaw Status\n'));
        
        if (serverInstance) {
          console.log(chalk.green('● Running'));
          console.log(chalk.gray(`  Port: ${config.port}`));
          console.log(chalk.gray(`  Dashboard: http://localhost:${config.port}`));
        } else {
          console.log(chalk.red('● Stopped'));
        }
        
        // Quick stats
        const stats = analyzer.analyzeSessions();
        console.log(chalk.bold('\n📈 Quick Stats\n'));
        console.log(chalk.gray(`  Sessions: ${stats.totalSessions}`));
        console.log(chalk.gray(`  Total Size: ${SessionAnalyzer.formatBytes(stats.totalSizeBytes)}`));
        console.log(chalk.gray(`  Orphaned: ${stats.orphaned.length}\n`));
      },
      
      dashboard: async () => {
        const { exec } = await import('child_process');
        const url = `http://localhost:${config.port}`;
        
        // Open browser
        const platform = os.platform();
        const command = platform === 'darwin' 
          ? `open "${url}"`
          : platform === 'win32'
          ? `start "${url}"`
          : `xdg-open "${url}"`;
        
        exec(command, (error) => {
          if (error) {
            console.error('Failed to open browser:', error);
            console.log(`Dashboard: ${url}`);
          }
        });
      },
    },
    
    // Cleanup on plugin unload
    onUnload: async () => {
      await stopServer();
    },
  };
}
