/**
 * Context Dashboard Server
 * Express API for session analysis and context management
 */

import express from 'express';
import * as path from 'path';
import { SessionAnalyzer } from './analyzers/session-analyzer';

export interface ServerConfig {
  port: number;
  openclawHome: string;
}

export class ContextServer {
  private app: express.Application;
  private server: any;
  private config: ServerConfig;
  private analyzer: SessionAnalyzer;
  
  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.analyzer = new SessionAnalyzer(config.openclawHome);
    this.setupRoutes();
  }
  
  private setupRoutes(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../dashboard/public')));
    
    // GET /api/sessions - Get all sessions with analysis
    this.app.get('/api/sessions', (req, res) => {
      try {
        const stats = this.analyzer.analyzeSessions();
        res.json(stats);
      } catch (error: any) {
        console.error('Error analyzing sessions:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    // GET /api/sessions/:id - Get specific session details
    this.app.get('/api/sessions/:id', (req, res) => {
      try {
        const sessionId = req.params.id;
        const details = this.analyzer.getSessionDetails(sessionId);
        
        if (!details) {
          return res.status(404).json({ error: 'Session not found' });
        }
        
        res.json(details);
      } catch (error: any) {
        console.error('Error getting session details:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    // POST /api/prune - Prune old sessions
    this.app.post('/api/prune', (req, res) => {
      try {
        const {
          daysOld = 30,
          keepMain = true,
          keepCron = true,
          dryRun = true,
        } = req.body;
        
        const result = this.analyzer.pruneSessions({
          daysOld,
          keepMain,
          keepCron,
          dryRun,
        });
        
        res.json({
          ...result,
          totalBytesFormatted: SessionAnalyzer.formatBytes(result.totalBytes),
          dryRun,
        });
      } catch (error: any) {
        console.error('Error pruning sessions:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    // POST /api/clean-orphaned - Clean up orphaned sessions
    this.app.post('/api/clean-orphaned', (req, res) => {
      try {
        const { dryRun = true } = req.body;
        const result = this.analyzer.cleanOrphaned(dryRun);
        
        res.json({
          ...result,
          totalBytesFormatted: SessionAnalyzer.formatBytes(result.totalBytes),
          dryRun,
        });
      } catch (error: any) {
        console.error('Error cleaning orphaned sessions:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    // GET /api/stats - Get summary statistics
    this.app.get('/api/stats', (req, res) => {
      try {
        const stats = this.analyzer.analyzeSessions();
        
        res.json({
          totalSessions: stats.totalSessions,
          totalMessages: stats.totalMessages,
          totalTokens: stats.totalTokens,
          totalSize: SessionAnalyzer.formatBytes(stats.totalSizeBytes),
          totalSizeBytes: stats.totalSizeBytes,
          orphanedCount: stats.orphaned.length,
          largestSession: stats.bySizeDesc[0] ? {
            id: stats.bySizeDesc[0].sessionKey,
            size: SessionAnalyzer.formatBytes(stats.bySizeDesc[0].sizeBytes),
            messages: stats.bySizeDesc[0].messageCount,
          } : null,
          oldestSession: stats.byAge[0] ? {
            id: stats.byAge[0].sessionKey,
            age: Math.floor((Date.now() - stats.byAge[0].lastModified.getTime()) / (1000 * 60 * 60 * 24)),
            lastModified: stats.byAge[0].lastModified.toISOString(),
          } : null,
        });
      } catch (error: any) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });
  }
  
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, () => {
          console.log(`📊 Context Dashboard: http://localhost:${this.config.port}`);
          resolve();
        });
        
        this.server.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.error(`Port ${this.config.port} is already in use`);
          }
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('ContextClaw server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
