/**
 * Audit Logging Interface
 *
 * Tracks all file operations for compliance, security, and debugging.
 * Decoupled from storage - can log to database, files, CloudWatch, etc.
 *
 * Key principle: Audit is INDEPENDENT and can be enabled/disabled via config.
 * Audit logging should NEVER fail the main upload flow.
 */

export enum FileOperationType {
  UPLOAD_START = 'UPLOAD_START',
  UPLOAD_COMPLETE = 'UPLOAD_COMPLETE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  COMMIT = 'COMMIT',
  DELETE = 'DELETE',
  DOWNLOAD = 'DOWNLOAD',
  PRESIGNED_URL_GENERATED = 'PRESIGNED_URL_GENERATED',
  CLEANUP = 'CLEANUP',
  VALIDATE = 'VALIDATE',
  PROCESS = 'PROCESS',
}

export interface AuditLogEntry {
  // Operation being performed
  operation: FileOperationType;

  // Timestamp of the operation
  timestamp: Date;

  // User performing the operation (if applicable)
  userId?: string;

  // Request ID for correlation
  requestId?: string;

  // File information
  fileKey?: string;
  uploadType?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;

  // Operation result
  status: 'success' | 'failure' | 'pending';
  statusCode?: number;
  errorMessage?: string;

  // Storage provider used
  provider?: string;

  // Additional metadata
  metadata?: Record<string, any>;

  // Encryption status
  encrypted?: boolean;

  // Duration in milliseconds
  durationMs?: number;
}

export interface IAuditLogger {
  /**
   * Logs a file operation.
   * Implementation must NOT throw - errors should be caught and logged.
   *
   * @param entry - Audit log entry
   */
  log(entry: AuditLogEntry): Promise<void>;

  /**
   * Retrieves audit logs for a file.
   * @param fileKey - File path/key
   * @returns Array of audit log entries
   */
  getAuditTrail(fileKey: string): Promise<AuditLogEntry[]>;

  /**
   * Retrieves audit logs for a user.
   * @param userId - User ID
   * @param limit - Maximum entries to return
   * @returns Array of audit log entries
   */
  getAuditTrailForUser(userId: string, limit?: number): Promise<AuditLogEntry[]>;

  /**
   * Retrieves audit logs for a date range.
   * Useful for compliance reporting.
   *
   * @param startDate - Start of range
   * @param endDate - End of range
   * @returns Array of audit log entries
   */
  getAuditTrailForDateRange(startDate: Date, endDate: Date): Promise<AuditLogEntry[]>;
}

/**
 * In-memory audit logger - useful for testing
 */
export class MockAuditLogger implements IAuditLogger {
  private logs: AuditLogEntry[] = [];

  async log(entry: AuditLogEntry): Promise<void> {
    this.logs.push(entry);
  }

  async getAuditTrail(fileKey: string): Promise<AuditLogEntry[]> {
    return this.logs.filter((log) => log.fileKey === fileKey);
  }

  async getAuditTrailForUser(userId: string): Promise<AuditLogEntry[]> {
    return this.logs.filter((log) => log.userId === userId);
  }

  async getAuditTrailForDateRange(startDate: Date, endDate: Date): Promise<AuditLogEntry[]> {
    return this.logs.filter((log) => log.timestamp >= startDate && log.timestamp <= endDate);
  }

  getLogs(): AuditLogEntry[] {
    return this.logs;
  }
}
