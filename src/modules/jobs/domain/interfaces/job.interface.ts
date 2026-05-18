/**
 * job.interface — BullMQ job payload and result types (domain layer).
 *
 * Pure contracts shared between producers (queues) and consumers (processors).
 * Lives in `domain/` because they describe the work the application performs,
 * independent of the queue backend.
 *
 * EmailJobData:
 *  Passed to EmailQueue.sendEmail() and received by EmailProcessor.handleSendEmail().
 *
 * UploadJobData / NotificationJobData:
 *  Reserved for future processors (virus scan, thumbnail generation, push
 *  notifications). Wire up when the corresponding processor is added.
 *
 * JobResult<T>:
 *  Standard return shape for every @Process() handler. Stored by Bull in Redis
 *  on completion (visible in Bull Board / getJobCounts).
 */
export interface EmailJobData {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, unknown>;
  html?: string;
  text?: string;
}

export interface UploadJobData {
  fileId: string;
  filePath: string;
  type: string;
  userId: string;
}

export interface NotificationJobData {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface JobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
