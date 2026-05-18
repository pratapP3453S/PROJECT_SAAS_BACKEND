# Jobs Module Developer Guide

## Purpose

The jobs module owns the BullMQ/Bull queue infrastructure: queue producers
that feature modules inject, processors that consume jobs from Redis, and the
typed payload contracts the two share.

## Layer map

```
modules/jobs/
├── domain/
│   └── interfaces/job.interface.ts          # EmailJobData, UploadJobData, NotificationJobData, JobResult<T>
├── infrastructure/
│   └── processors/email.processor.ts        # @Processor(QUEUE_NAMES.EMAIL)
├── application/
│   └── queues/email.queue.ts                # @Injectable() producer (other features inject this)
└── jobs.module.ts                           # BullModule.forRootAsync + queue registration
```

## Queue inventory

| Queue                          | Producer       | Processor          | Status     |
| ------------------------------ | -------------- | ------------------ | ---------- |
| `QUEUE_NAMES.EMAIL`            | `EmailQueue`   | `EmailProcessor`   | Wired      |
| `QUEUE_NAMES.UPLOAD`           | —              | —                  | Reserved   |
| `QUEUE_NAMES.NOTIFICATION`     | —              | —                  | Reserved   |

Queue names live in [shared/constants/app.constants.ts](../../../shared/constants/app.constants.ts);
add new names there first, then register them in `jobs.module.ts`.

## Email flow

1. Feature service injects `EmailQueue` and calls `sendEmail({ to, subject, ... })`.
2. The job is added to Redis under `QUEUE_NAMES.EMAIL` with:
   - `attempts: 3`
   - `backoff: { type: 'exponential', delay: 2000 }`
   - `removeOnComplete: 100`, `removeOnFail: 50`
3. `EmailProcessor.handleSendEmail()` picks the job up.
4. (TODO) the processor calls your real email provider (Nodemailer, SendGrid, SES, …).
5. Success → `JobResult { success: true }` is stored in Redis.
6. Failure → exception re-thrown so Bull triggers the back-off retry.

## Dependencies

- `@nestjs/bull` + `bull` for the queue plumbing.
- `ConfigService` reads the `redis.*` namespace for connection details.
- `QUEUE_NAMES` and `JOB_NAMES` from [shared/constants](../../../shared/constants/).

## Adding a new queue

1. Add the queue name to `QUEUE_NAMES` and any new job types to `JOB_NAMES` in `app.constants.ts`.
2. Define the payload + result types in `domain/interfaces/job.interface.ts`.
3. Register the queue in `jobs.module.ts` (`BullModule.registerQueue({ name: QUEUE_NAMES.X })`).
4. Add a producer under `application/queues/` (mirrors `EmailQueue`).
5. Add a processor under `infrastructure/processors/` (mirrors `EmailProcessor`).
6. Export the producer from `jobs.module.ts` so other features can inject it.
7. Update this guide.

## Complexity And Risk

- Low complexity in isolation; risk is operational.
- Bull needs a healthy Redis. A Redis outage means jobs aren't processed (and producers will queue them into a failing connection). Add a Redis health indicator if uptime matters.
- Default `attempts: 3` + exponential back-off is sensible; tune per-queue when failures are routinely transient (e.g. raise to 5) or routinely terminal (e.g. drop to 1).
- `removeOnComplete: 100` / `removeOnFail: 50` keeps Redis lean. Bumping these
  retains more history at the cost of memory.
- Processors should be idempotent — Bull can replay jobs across worker
  restarts.
