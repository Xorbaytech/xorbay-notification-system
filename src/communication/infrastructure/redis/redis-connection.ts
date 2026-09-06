/**
 * The small common subset understood by both BullMQ and ioredis.  Keeping
 * this local type avoids coupling the configuration helper to either
 * library's version-specific option interfaces.
 */
export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, unknown>;
};

/**
 * Builds one Redis connection policy for BullMQ and the shared provider gate.
 *
 * REDIS_URL is preferred because it carries host, credentials and the
 * rediss:// TLS signal in one deployment-safe value.  The host/port/password
 * variables remain supported for local development and existing deployments.
 */
export function redisConnectionOptions(env: NodeJS.ProcessEnv = process.env): RedisConnectionOptions {
  const configuredUrl = env.REDIS_URL?.trim();
  if (configuredUrl) return parseRedisUrl(configuredUrl);

  const options: RedisConnectionOptions = {
    host: env.REDIS_HOST?.trim() || 'localhost',
    port: readPort(env.REDIS_PORT, 6379),
  };

  const username = env.REDIS_USERNAME?.trim();
  const password = env.REDIS_PASSWORD;
  if (username) options.username = username;
  if (password) options.password = password;
  if (env.REDIS_TLS === 'true') options.tls = {};
  return options;
}

function parseRedisUrl(value: string): RedisConnectionOptions {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }

  const options: RedisConnectionOptions = {
    host: parsed.hostname,
    port: parsed.port ? readPort(parsed.port, 6379) : 6379,
  };
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (parsed.password) options.password = decodeURIComponent(parsed.password);
  const database = parsed.pathname.replace(/^\/+/, '');
  if (database) {
    const db = Number(database);
    if (!Number.isInteger(db) || db < 0) {
      throw new Error('REDIS_URL database path must be a non-negative integer');
    }
    options.db = db;
  }
  if (parsed.protocol === 'rediss:') options.tls = {};
  return options;
}

function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}
