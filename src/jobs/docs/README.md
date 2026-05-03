# Jobs Layer Developer Guide

## Purpose

`src/jobs` owns background queue infrastructure. It currently provides an email queue producer and processor using Bull with Redis.

## Queue Flow

### Producer

1. A feature service injects `EmailQueue`.
2. It calls `sendEmail(data, delay?)`.
3. `EmailQueue` adds a `send-email` job to `QUEUE_NAMES.EMAIL`.
4. Job options include attempts, exponential backoff, and Redis cleanup limits.

### Processor

1. `EmailProcessor` subscribes to `QUEUE_NAMES.EMAIL`.
2. `handleSendEmail()` receives a Bull job.
3. The current implementation simulates a send and returns success.
4. Errors are rethrown so Bull retries according to configured backoff.
5. Queue lifecycle hooks log active, completed, and failed states.

## Key Files

- `jobs.module.ts`: Redis queue configuration and queue registration.
- `queues/email.queue.ts`: email job producer.
- `processors/email.processor.ts`: email job consumer.
- `interfaces/job.interface.ts`: job data and result contracts.

## Dependencies

- Redis connection values come from `redis.*` config namespace.
- Queue names and job names come from `src/common/constants/app.constants.ts`.
- `@nestjs/bull` and `bull` provide queue integration.

## Complexity And Risk

- Low to medium complexity.
- Highest-risk area: job retries. Make processors idempotent because a failed or timed-out job can run again.
- Do not put HTTP request objects or large binary payloads in jobs. Store durable references instead.
- The email processor is a stub. Before production email use, integrate an actual provider and define provider error handling.
- The registered upload and notification queues currently have no processors.

## Adding A Job

1. Add queue and job names to `app.constants.ts`.
2. Register the queue in `JobsModule`.
3. Create a producer service in `queues/`.
4. Create a processor in `processors/`.
5. Define typed payloads in `interfaces/job.interface.ts`.
6. Document retry behavior, idempotency expectations, and failure handling here.

