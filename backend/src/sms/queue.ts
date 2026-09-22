import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { pool } from "../db";
import { getSmsProvider } from "./index";

export const SMS_QUEUE_NAME = "sms";

export interface SmsJobData {
  smsMessageId: number;
  phoneNumbers: string[];
  text: string;
}

let connection: IORedis | null = null;
let queue: Queue<SmsJobData> | null = null;
let worker: Worker<SmsJobData> | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://redis:6379";
}

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return connection;
}

export function getSmsQueue(): Queue<SmsJobData> {
  if (!queue) {
    queue = new Queue<SmsJobData>(SMS_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return queue;
}

async function processSmsJob(job: Job<SmsJobData>) {
  const { smsMessageId, phoneNumbers, text } = job.data;
  const provider = getSmsProvider();

  await pool.query(
    "UPDATE sms_messages SET status = 'sending', job_id = $1, updated_at = now() WHERE id = $2",
    [job.id, smsMessageId]
  );

  try {
    await provider.send(phoneNumbers, text);
    await pool.query(
      "UPDATE sms_messages SET status = 'sent', sent_at = now(), error_message = NULL, updated_at = now() WHERE id = $1",
      [smsMessageId]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMS send failed";
    await pool.query(
      "UPDATE sms_messages SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2",
      [message, smsMessageId]
    );
    throw err;
  }
}

export async function startSmsWorker(): Promise<void> {
  if (worker) return;

  await ensureRedisConnected();
  const redis = getRedisConnection();

  worker = new Worker<SmsJobData>(SMS_QUEUE_NAME, processSmsJob, {
    connection: redis,
    concurrency: 2,
  });

  worker.on("failed", (job, err) => {
    console.error(`SMS job ${job?.id} failed`, err);
  });

  console.log("SMS queue worker started");
}

export async function getSmsQueueStats() {
  const q = getSmsQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    await ensureRedisConnected();
    const redis = getRedisConnection();
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export async function ensureRedisConnected(): Promise<void> {
  const redis = getRedisConnection();
  if (redis.status !== "ready") {
    await redis.connect();
  }
}
