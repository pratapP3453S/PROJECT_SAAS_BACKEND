import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { QUEUE_NAMES, JOB_NAMES } from '../../common/constants/app.constants';
import { EmailJobData } from '../interfaces/job.interface';

/**
 * EmailQueue — BullMQ producer service for the email queue.
 *
 * Responsibility: Enqueues email jobs onto the Redis-backed Bull queue named
 * QUEUE_NAMES.EMAIL. Does not send emails itself — that is EmailProcessor's job.
 * Injectable into any service that needs to trigger an email send.
 *
 * sendEmail(data, delay?) flow:
 * 1. emailQueue.add(JOB_NAMES.SEND_EMAIL, data, options) — adds the job.
 *    Options:
 *      delay         : milliseconds to wait before the worker picks it up (default 0).
 *      attempts      : retry up to 3 times on failure.
 *      backoff       : exponential back-off starting at 2 s between retries.
 *      removeOnComplete: keep only the last 100 completed jobs in Redis.
 *      removeOnFail  : keep only the last 50 failed jobs in Redis.
 * 2. Logs the recipient(s) for traceability.
 *
 * getJobCounts() — returns queue depth statistics (active, waiting, completed, failed).
 * Useful for health checks or admin dashboards.
 *
 * Processed by: EmailProcessor → src/jobs/processors/email.processor.ts
 * Registered in: JobsModule → src/jobs/jobs.module.ts
 * Job data shape: EmailJobData → src/jobs/interfaces/job.interface.ts
 */
@Injectable()
export class EmailQueue {
  private readonly logger = new Logger(EmailQueue.name);

  constructor(@InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue) {}

  async sendEmail(data: EmailJobData, delay = 0): Promise<void> {
    await this.emailQueue.add(JOB_NAMES.SEND_EMAIL, data, {
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    this.logger.log(
      `Email job queued for: ${Array.isArray(data.to) ? data.to.join(', ') : data.to}`,
    );
  }

  async getJobCounts() {
    return this.emailQueue.getJobCounts();
  }
}
