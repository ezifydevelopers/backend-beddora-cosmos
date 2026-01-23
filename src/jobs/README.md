# Queue System for Background Jobs

This directory contains the BullMQ-based queue system for processing background jobs.

## Architecture

### Components

1. **Queue Configuration** (`../config/queue.ts`)
   - Queue initialization and management
   - Connection handling
   - Queue statistics

2. **Workers** (`workers.ts`)
   - Initializes all workers
   - Workers process jobs from queues

3. **Processors** (`processors/`)
   - `data-sync.processor.ts` - Processes data sync jobs
   - `reports.processor.ts` - Processes report generation jobs
   - `alerts.processor.ts` - Processes alert generation jobs
   - `manual-sync.processor.ts` - Processes manual sync jobs

4. **Schedulers** (`schedulers/`)
   - `data-sync.scheduler.ts` - Schedules recurring data sync jobs
   - `reports.scheduler.ts` - Schedules recurring report generation
   - `alerts.scheduler.ts` - Schedules recurring alert checks

## Queues

- **data-sync** - Amazon data synchronization (orders, fees, PPC, inventory, listings, refunds)
- **reports** - Report generation
- **alerts** - Alert generation (low stock, high ACOS, etc.)
- **manual-sync** - User-initiated sync jobs

## Job Scheduling

### Recurring Jobs

- **Data Sync**: Every hour (`0 * * * *`)
- **Reports**: Daily at 2 AM (`0 2 * * *`)
- **Alerts**: Every 15 minutes (`*/15 * * * *`)

### Manual Jobs

Jobs can be added manually via the queue API:

```typescript
import { getQueue, QueueName } from '../config/queue'

const queue = getQueue(QueueName.MANUAL_SYNC)
await queue.add('manual-sync', {
  amazonAccountId: 'account-id',
  userId: 'user-id',
  syncType: 'orders',
})
```

## Job Processing

### Retry Logic

- **Default attempts**: 3
- **Backoff**: Exponential (starts at 2 seconds)
- **Failed jobs**: Kept for 7 days
- **Completed jobs**: Kept for 24 hours (last 1000)

### Concurrency

- **Default concurrency**: 5 jobs per worker
- **Rate limiting**: 10 jobs per second

## Monitoring

### Queue Statistics

```typescript
import { getQueueStats } from '../config/queue'

const stats = await getQueueStats(QueueName.DATA_SYNC)
// Returns: { waiting, active, completed, failed, delayed, total }
```

### Job Status

Jobs can be tracked via BullMQ's built-in methods:

```typescript
const job = await queue.getJob('job-id')
const state = await job.getState() // 'completed', 'failed', 'active', etc.
const progress = job.progress // 0-100
```

## Migration from node-cron

The old `node-cron` based jobs have been replaced:

- ❌ `data-sync.job.ts` (old)
- ✅ `schedulers/data-sync.scheduler.ts` + `processors/data-sync.processor.ts`

- ❌ `reports.job.ts` (old)
- ✅ `schedulers/reports.scheduler.ts` + `processors/reports.processor.ts`

- ❌ `alerts.job.ts` (old)
- ✅ `schedulers/alerts.scheduler.ts` + `processors/alerts.processor.ts`

## Requirements

- **Redis**: Required for queue system to work
- **BullMQ**: Installed as dependency

## Benefits

1. **Scalability**: Jobs can be processed across multiple workers/instances
2. **Reliability**: Automatic retries with exponential backoff
3. **Monitoring**: Built-in job tracking and statistics
4. **Priority**: Jobs can have different priorities
5. **Delays**: Jobs can be scheduled with delays
6. **Progress Tracking**: Real-time job progress updates

## Future Enhancements

- [ ] Job dashboard UI
- [ ] Webhook notifications for job completion
- [ ] Job dependencies (job B waits for job A)
- [ ] Job batching
- [ ] Dead letter queue management UI
