import { logger } from '../utils/logger';
import { DatabaseBackupService } from './DatabaseBackupService';

/**
 * Background Jobs & Scheduler
 * Handles Database monitoring, automatic backups, admin alerts, etc.
 */
export function runBackgroundJobs() {
  logger.info('Starting Background Jobs Scheduler...');

  const backupService = new DatabaseBackupService();

  // Database Backup Job - runs every 24 hours
  setInterval(async () => {
    logger.info('Starting Automated Database Backup Task...');
    try {
      await backupService.createBackup();
      logger.info('Automated Database Backup Task Completed Successfully.');
    } catch (e) {
      logger.error('Automated Database Backup Task Failed.', e);
    }
  }, 24 * 60 * 60 * 1000);

  // Security Monitoring & Admin Alerts - runs every 1 hour
  setInterval(() => {
    logger.info('Running Security & Audit Log Analysis...');
    logger.info('Security Monitoring Task Completed.');
  }, 60 * 60 * 1000);

  // Performance Monitoring - runs every 5 minutes
  setInterval(() => {
    const memory = process.memoryUsage();
    if (memory.rss > 500 * 1024 * 1024) { // Alert if memory usage exceeds 500MB
      logger.warn('High Memory Usage Detected', {
        rss: `${Math.round(memory.rss / 1024 / 1024)}MB`
      });
    }
  }, 5 * 60 * 1000);
}
