import { Injectable, Logger } from '@nestjs/common';
import { AuditLogEntry, IAuditLogger } from '../../domain/interfaces/audit-logger.interface';
import { UploadConfigService } from '../config/upload-config.service';

/**
 * AuditLoggerService — implements IAuditLogger (infrastructure adapter).
 *
 * Logs all file operations for compliance and debugging.
 * Currently logs to NestJS Logger (console/file via NestJS logging) plus an
 * in-memory ring buffer for test introspection. Can be extended to:
 *  - Store in database (Prisma)
 *  - Send to CloudWatch/DataDog
 *  - Write to file system
 *  - Stream to message queue (RabbitMQ, Kafka)
 *
 * Key principle: Audit logging MUST NEVER throw or fail the main upload flow.
 * All errors are caught and logged internally.
 *
 * Layer: infrastructure/audit — concrete logging sink. Domain code calls the
 * IAuditLogger port and never knows which sink is active.
 */
@Injectable()
export class AuditLoggerService implements IAuditLogger {
  private readonly logger = new Logger(AuditLoggerService.name);
  private logs: AuditLogEntry[] = []; // In-memory buffer (use database in production)

  constructor(private readonly uploadConfig: UploadConfigService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      if (!this.uploadConfig.getConfig().enableAuditLogging) {
        return;
      }

      // Add to in-memory buffer
      this.logs.push(entry);

      // Log to console
      const logMessage = this.formatLogMessage(entry);
      if (entry.status === 'failure') {
        this.logger.error(logMessage);
      } else {
        this.logger.debug(logMessage);
      }

      // In production, implement based on auditLogDestination:
      // - 'database': this.logToDatabase(entry)
      // - 'file': this.logToFile(entry)
      // - 'cloudwatch': this.logToCloudWatch(entry)
    } catch (error) {
      // Silently catch to prevent breaking the upload flow
      this.logger.warn(`Audit logging failed: ${(error as Error).message}`);
    }
  }

  async getAuditTrail(fileKey: string): Promise<AuditLogEntry[]> {
    return this.logs.filter((log) => log.fileKey === fileKey);
  }

  async getAuditTrailForUser(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.logs.filter((log) => log.userId === userId).slice(-limit);
  }

  async getAuditTrailForDateRange(startDate: Date, endDate: Date): Promise<AuditLogEntry[]> {
    return this.logs.filter((log) => log.timestamp >= startDate && log.timestamp <= endDate);
  }

  /**
   * Formats audit log entry for human-readable logging.
   */
  private formatLogMessage(entry: AuditLogEntry): string {
    const parts = [
      entry.operation,
      `status=${entry.status}`,
      entry.fileKey && `file=${entry.fileKey}`,
      entry.userId && `user=${entry.userId}`,
      entry.fileSizeBytes && `size=${entry.fileSizeBytes}`,
      entry.durationMs && `duration=${entry.durationMs}ms`,
    ];

    return parts.filter(Boolean).join(' | ');
  }

  /** Returns all in-memory logs (useful for testing). */
  getAllLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  /** Clears in-memory logs (useful for testing). */
  clearLogs(): void {
    this.logs = [];
  }
}
