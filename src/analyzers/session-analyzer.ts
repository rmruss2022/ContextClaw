/**
 * Session Analyzer
 * Analyzes OpenClaw session files for context usage, token counts, and cleanup opportunities
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SessionInfo {
  sessionKey: string;
  sessionId: string;
  filePath: string;
  messageCount: number;
  tokenCount: number;
  sizeBytes: number;
  lastModified: Date;
  agentType: 'main' | 'cron' | 'subagent' | 'unknown';
  label?: string;
}

export interface SessionStats {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  totalSizeBytes: number;
  bySizeDesc: SessionInfo[];
  byAge: SessionInfo[];
  orphaned: SessionInfo[];
}

export class SessionAnalyzer {
  private sessionsDir: string;
  private sessionsJsonPath: string;
  
  constructor(openclawHome: string = path.join(require('os').homedir(), '.openclaw')) {
    this.sessionsDir = path.join(openclawHome, 'agents', 'main', 'sessions');
    this.sessionsJsonPath = path.join(this.sessionsDir, 'sessions.json');
  }
  
  /**
   * Load sessions.json metadata
   */
  private loadSessionsMetadata(): Record<string, any> {
    try {
      const data = fs.readFileSync(this.sessionsJsonPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  }
  
  /**
   * Analyze a single session file
   */
  private analyzeSessionFile(filePath: string): SessionInfo | null {
    try {
      const fileName = path.basename(filePath);
      const sessionId = fileName.replace('.jsonl', '');
      
      // Get file stats
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      // Count messages and estimate tokens
      let messageCount = 0;
      let tokenCount = 0;
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const msg = entry.message || entry;
          
          if (msg && msg.role) {
            messageCount++;
            
            // Rough token estimation: 1 token ≈ 4 chars
            if (msg.content) {
              if (typeof msg.content === 'string') {
                tokenCount += Math.ceil(msg.content.length / 4);
              } else if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                  if (item.type === 'text' && item.text) {
                    tokenCount += Math.ceil(item.text.length / 4);
                  }
                  if (item.type === 'toolCall' && item.arguments) {
                    tokenCount += Math.ceil(JSON.stringify(item.arguments).length / 4);
                  }
                }
              }
            }
          }
        } catch (e) {
          // Skip invalid lines
        }
      }
      
      // Determine agent type from sessionId or filename
      let agentType: 'main' | 'cron' | 'subagent' | 'unknown' = 'unknown';
      if (sessionId.includes('main')) agentType = 'main';
      else if (sessionId.includes('cron')) agentType = 'cron';
      else if (sessionId.length === 36 && sessionId.includes('-')) agentType = 'subagent'; // UUID format
      
      return {
        sessionKey: sessionId,
        sessionId,
        filePath,
        messageCount,
        tokenCount,
        sizeBytes: stats.size,
        lastModified: stats.mtime,
        agentType,
      };
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error);
      return null;
    }
  }
  
  /**
   * Analyze all sessions
   */
  public analyzeSessions(): SessionStats {
    const metadata = this.loadSessionsMetadata();
    const sessions: SessionInfo[] = [];
    
    // Get all .jsonl files
    const files = fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(this.sessionsDir, f));
    
    for (const file of files) {
      const info = this.analyzeSessionFile(file);
      if (info) {
        // Enrich with label from sessions.json
        const metaKey = Object.keys(metadata).find(k => 
          metadata[k].sessionId === info.sessionId
        );
        if (metaKey && metadata[metaKey].label) {
          info.label = metadata[metaKey].label;
        }
        
        sessions.push(info);
      }
    }
    
    // Calculate stats
    const totalSessions = sessions.length;
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
    const totalTokens = sessions.reduce((sum, s) => sum + s.tokenCount, 0);
    const totalSizeBytes = sessions.reduce((sum, s) => sum + s.sizeBytes, 0);
    
    // Sort by size (largest first)
    const bySizeDesc = [...sessions].sort((a, b) => b.sizeBytes - a.sizeBytes);
    
    // Sort by age (oldest first)
    const byAge = [...sessions].sort((a, b) => 
      a.lastModified.getTime() - b.lastModified.getTime()
    );
    
    // Find orphaned sessions (not in sessions.json)
    const knownIds = new Set(Object.values(metadata).map((m: any) => m.sessionId));
    const orphaned = sessions.filter(s => !knownIds.has(s.sessionId));
    
    return {
      totalSessions,
      totalMessages,
      totalTokens,
      totalSizeBytes,
      bySizeDesc,
      byAge,
      orphaned,
    };
  }
  
  /**
   * Prune old sessions
   */
  public pruneSessions(options: {
    daysOld?: number;
    keepMain?: boolean;
    keepCron?: boolean;
    dryRun?: boolean;
  } = {}): { deleted: string[], kept: string[], totalBytes: number } {
    const {
      daysOld = 30,
      keepMain = true,
      keepCron = true,
      dryRun = false,
    } = options;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const stats = this.analyzeSessions();
    const deleted: string[] = [];
    const kept: string[] = [];
    let totalBytes = 0;
    
    for (const session of stats.byAge) {
      // Skip if newer than cutoff
      if (session.lastModified > cutoffDate) {
        kept.push(session.sessionKey);
        continue;
      }
      
      // Skip main agent if keepMain
      if (keepMain && session.agentType === 'main') {
        kept.push(session.sessionKey);
        continue;
      }
      
      // Skip cron sessions if keepCron
      if (keepCron && session.agentType === 'cron') {
        kept.push(session.sessionKey);
        continue;
      }
      
      // Delete this session
      if (!dryRun) {
        try {
          fs.unlinkSync(session.filePath);
          deleted.push(session.sessionKey);
          totalBytes += session.sizeBytes;
        } catch (error) {
          console.error(`Failed to delete ${session.filePath}:`, error);
          kept.push(session.sessionKey);
        }
      } else {
        deleted.push(session.sessionKey);
        totalBytes += session.sizeBytes;
      }
    }
    
    return { deleted, kept, totalBytes };
  }
  
  /**
   * Clean up orphaned sessions
   */
  public cleanOrphaned(dryRun: boolean = false): { deleted: string[], totalBytes: number } {
    const stats = this.analyzeSessions();
    const deleted: string[] = [];
    let totalBytes = 0;
    
    for (const session of stats.orphaned) {
      if (!dryRun) {
        try {
          fs.unlinkSync(session.filePath);
          deleted.push(session.sessionKey);
          totalBytes += session.sizeBytes;
        } catch (error) {
          console.error(`Failed to delete ${session.filePath}:`, error);
        }
      } else {
        deleted.push(session.sessionKey);
        totalBytes += session.sizeBytes;
      }
    }
    
    return { deleted, totalBytes };
  }
  
  /**
   * Get detailed info for a specific session
   */
  public getSessionDetails(sessionId: string): SessionInfo | null {
    const filePath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return this.analyzeSessionFile(filePath);
  }
  
  /**
   * Format bytes to human-readable size
   */
  public static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}
