import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { QUEUE_NAMES, JOB_NAMES } from '../../../../shared/constants/app.constants';
import { EmailJobData } from '../../domain/interfaces/job.interface';

/**
 * EmailQueue — BullMQ producer service for the email queue.
 *
 * Layer: application/queues — the use-case surface other features inject to
 * enqueue email jobs. Does not send emails itself — that's EmailProcessor's
 * responsibility (infrastructure layer).
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
 * Processed by: EmailProcessor → src/modules/jobs/infrastructure/processors/email.processor.ts
 * Job data shape: EmailJobData → src/modules/jobs/domain/interfaces/job.interface.ts
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
