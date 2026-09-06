import { redisConnectionOptions } from './redis-connection';

describe('redisConnectionOptions', () => {
  it('parses authenticated TLS URLs for production Redis', () => {
    const options = redisConnectionOptions({
      REDIS_URL: 'rediss://worker:p%40ss@redis.example.com:6380/0',
    });

    expect(options).toMatchObject({
      host: 'redis.example.com',
      port: 6380,
      username: 'worker',
      password: 'p@ss',
      db: 0,
      tls: {},
    });
  });

  it('keeps host/port variables compatible with local Redis', () => {
    const options = redisConnectionOptions({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: 'local-secret',
      REDIS_TLS: 'false',
    });

    expect(options).toEqual({
      host: '127.0.0.1',
      port: 6379,
      password: 'local-secret',
    });
  });

  it('rejects unsupported URL schemes instead of silently connecting insecurely', () => {
    expect(() => redisConnectionOptions({ REDIS_URL: 'http://redis.example.com' })).toThrow(
      'REDIS_URL must use redis:// or rediss://',
    );
  });

  it('rejects an invalid database path', () => {
    expect(() => redisConnectionOptions({ REDIS_URL: 'redis://redis.example.com/not-a-db' })).toThrow(
      'REDIS_URL database path must be a non-negative integer',
    );
  });
});
