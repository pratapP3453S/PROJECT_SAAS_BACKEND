/**
 * job.interface — BullMQ job payload and result types.
 *
 * EmailJobData:
 *  Passed to EmailQueue.sendEmail() and received by EmailProcessor.handleSendEmail().
 *  to       : single address or array of addresses.
 *  subject  : email subject line.
 *  template : optional template name (for template engines like Handlebars/MJML).
 *  context  : template variable map (passed to the template engine).
 *  html     : pre-rendered HTML body (used when not using a template).
 *  text     : plain-text fallback body.
 *
 * UploadJobData:
 *  Reserved for async file processing jobs (e.g., virus scan, thumbnail generation).
 *  Not yet wired to a processor; add UploadProcessor when needed.
 *
 * NotificationJobData:
 *  Reserved for push notification / in-app notification jobs.
 *  Not yet wired to a processor; add NotificationProcessor when needed.
 *
 * JobResult<T>:
 *  Standard return type for all @Process() handler methods.
 *  Stored by Bull in Redis on job completion (visible in Bull Board / getJobCounts).
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
