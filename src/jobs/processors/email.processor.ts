import { OnQueueActive, OnQueueCompleted, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_NAMES } from '../../common/constants/app.constants';
import { EmailJobData, JobResult } from '../interfaces/job.interface';

/**
 * EmailProcessor — BullMQ consumer for the email queue.
 *
 * Responsibility: Picks up SEND_EMAIL jobs from the Redis queue and executes
 * the actual email delivery logic. Errors are re-thrown so Bull can apply the
 * configured retry / back-off policy.
 *
 * Lifecycle hooks (decorator-driven):
 *  @OnQueueActive()    → logs job start (debug level).
 *  @OnQueueCompleted() → logs success (info level).
 *  @OnQueueFailed()    → logs final failure with attempt count (error level).
 *
 * handleSendEmail(job) flow:
 * 1. Extract `to` and `subject` from job.data (typed as EmailJobData).
 * 2. TODO: Call your email provider (Nodemailer / SendGrid / SES / etc.).
 *    The stub currently simulates a 100ms async send.
 * 3. Return JobResult { success: true, data: { to, subject } } on success.
 * 4. Re-throw on error so Bull records it and triggers back-off retries.
 *
 * Retry policy (configured in EmailQueue.sendEmail):
 *  attempts=3, exponential back-off starting at 2000ms.
 *
 * Queue name : QUEUE_NAMES.EMAIL = 'email-queue'
 * Job name   : JOB_NAMES.SEND_EMAIL = 'send-email'
 *
 * Producer: EmailQueue → src/jobs/queues/email.queue.ts
 * See also: job.interface.ts → src/jobs/interfaces/job.interface.ts
 */
@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  @Process(JOB_NAMES.SEND_EMAIL)
  async handleSendEmail(job: Job<EmailJobData>): Promise<JobResult> {
    const { to, subject } = job.data;
    this.logger.log(`Processing email job ${job.id}: "${subject}" -> ${to}`);

    try {
      // TODO: Integrate with your email provider (Nodemailer, SendGrid, SES, etc.)
      // Example:
      // await this.mailerService.sendMail({
      //   to: job.data.to,
      //   subject: job.data.subject,
      //   html: job.data.html,
      // });

      // Simulate async email send
      await new Promise((resolve) => setTimeout(resolve, 100));

      return { success: true, data: { to, subject } };
    } catch (error) {
      this.logger.error(`Email job ${job.id} failed: ${(error as Error).message}`);
      throw error;
    }
  }

  @OnQueueActive()
  onActive(job: Job): void {
    this.logger.debug(`Email job ${job.id} started`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job): void {
    this.logger.log(`Email job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Email job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }
}
