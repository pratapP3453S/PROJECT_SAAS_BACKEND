import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '../common/constants/app.constants';
import { EmailProcessor } from './processors/email.processor';
import { EmailQueue } from './queues/email.queue';

/**
 * JobsModule — BullMQ/Bull queue infrastructure module.
 *
 * Responsibility: Wires the Redis-backed Bull queue system, registers all queue
 * names, and provides producer (EmailQueue) and consumer (EmailProcessor) classes.
 * Imported by AppModule for application-wide job processing capability.
 *
 * BullModule.forRootAsync:
 *  Reads Redis connection details from the 'redis.*' config namespace.
 *  defaultJobOptions apply to all queues unless overridden per job:
 *    removeOnComplete=100 : keeps last 100 completed jobs in Redis.
 *    removeOnFail=50      : keeps last 50 failed jobs for debugging.
 *    attempts=3           : retry failed jobs up to 3 times.
 *    backoff.exponential  : 1 s, 2 s, 4 s between retries.
 *
 * BullModule.registerQueue:
 *  Registers QUEUE_NAMES.EMAIL, UPLOAD, NOTIFICATION queues.
 *  Add new queues here and in QUEUE_NAMES (app.constants.ts) simultaneously.
 *
 * Exports:
 *  EmailQueue  : injectable producer; any module that imports JobsModule can
 *                inject EmailQueue to enqueue emails.
 *  BullModule  : re-exported so feature modules can use @InjectQueue without
 *                re-declaring BullModule themselves.
 *
 * Used by: AppModule → imports: [..., JobsModule]
 * See also:
 *  EmailQueue     → src/jobs/queues/email.queue.ts
 *  EmailProcessor → src/jobs/processors/email.processor.ts
 *  QUEUE_NAMES    → src/common/constants/app.constants.ts
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password') || undefined,
          db: configService.get<number>('redis.db', 0),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.UPLOAD },
      { name: QUEUE_NAMES.NOTIFICATION },
    ),
  ],
  providers: [EmailProcessor, EmailQueue],
  exports: [EmailQueue, BullModule],
})
export class JobsModule {}
