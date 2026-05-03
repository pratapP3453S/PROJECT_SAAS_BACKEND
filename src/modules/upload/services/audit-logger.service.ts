import { Injectable, Logger } from '@nestjs/common';
import { AuditLogEntry, IAuditLogger } from '../interfaces/audit-logger.interface';
import { UploadConfigService } from '../config/upload-config.service';

/**
 * AuditLoggerService — implements IAuditLogger
 *
 * Logs all file operations for compliance and debugging.
 * Currently logs to NestJS Logger (console/file via NestJS logging).
 * Can be extended to:
 * - Store in database (Prisma)
 * - Send to CloudWatch/DataDog
 * - Write to file system
 * - Stream to message queue (RabbitMQ, Kafka)
 *
 * Key principle: Audit logging MUST NEVER throw or fail the main upload flow.
 * All errors are caught and logged internally.
 */
@Injectable()
export class AuditLoggerService implements IAuditLogger {
  private readonly logger = new Logger(AuditLoggerService.name);
  private logs: AuditLogEntry[] = []; // In-memory buffer (use database in production)

  constructor(private readonly uploadConfig: UploadConfigService) {}

  /**
   * Logs a file operation.
   * This is the main logging method. Implementation should:
   * - Never throw exceptions
   * - Work asynchronously
   * - Handle batching for performance
   *
   * @param entry - Audit log entry
   */
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

  /**
   * Retrieves audit logs for a file.
   * In production, query from database.
   *
   * @param fileKey - File path/key
   * @returns Array of audit log entries
   */
  async getAuditTrail(fileKey: string): Promise<AuditLogEntry[]> {
    return this.logs.filter((log) => log.fileKey === fileKey);
  }

  /**
   * Retrieves audit logs for a user.
   * In production, query from database with pagination.
   *
   * @param userId - User ID
   * @param limit - Maximum entries to return
   * @returns Array of audit log entries
   */
  async getAuditTrailForUser(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.logs.filter((log) => log.userId === userId).slice(-limit);
  }

  /**
   * Retrieves audit logs for a date range.
   * In production, query from database with efficient indexing.
   *
   * @param startDate - Start of range
   * @param endDate - End of range
   * @returns Array of audit log entries
   */
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

  /**
   * Returns all in-memory logs (useful for testing).
   */
  getAllLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  /**
   * Clears in-memory logs (useful for testing).
   */
  clearLogs(): void {
    this.logs = [];
  }
}
