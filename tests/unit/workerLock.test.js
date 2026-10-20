import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  acquireWorkerLock,
  releaseWorkerLock,
  startLockHeartbeat,
  workerOwner,
} from '@/lib/worker/lock.js';

function mockClient(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('workerOwner', () => {
  it('uses the GitHub run id when present', () => {
    vi.stubEnv('GITHUB_RUN_ID', '12345');
    vi.stubEnv('GITHUB_RUN_ATTEMPT', '2');
    expect(workerOwner('ingest')).toBe('ingest:gha-12345-2');
  });

  it('falls back to the pid locally', () => {
    vi.stubEnv('GITHUB_RUN_ID', '');
    expect(workerOwner('pulse')).toBe(`pulse:pid-${process.pid}`);
  });
});

describe('acquireWorkerLock', () => {
  it('returns true when the RPC grants the lease', async () => {
    const client = mockClient(async () => ({ data: true, error: null }));
    await expect(acquireWorkerLock(client, 'ingest', { owner: 'a' })).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('worker_lock_acquire', {
      p_name: 'ingest',
      p_ttl_seconds: 900,
      p_owner: 'a',
    });
  });

  it('returns false when another owner holds the lease', async () => {
    const client = mockClient(async () => ({ data: false, error: null }));
    await expect(acquireWorkerLock(client, 'ingest', { owner: 'a' })).resolves.toBe(false);
  });

  it('fails open (true) when the lock RPC is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = mockClient(async () => ({ data: null, error: { message: 'function missing' } }));
    await expect(acquireWorkerLock(client, 'ingest', { owner: 'a' })).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('returns true with no client (nothing to guard)', async () => {
    await expect(acquireWorkerLock(null, 'ingest')).resolves.toBe(true);
  });
});

describe('releaseWorkerLock', () => {
  it('releases when this owner holds it', async () => {
    const client = mockClient(async () => ({ data: true, error: null }));
    await expect(releaseWorkerLock(client, 'ingest', 'a')).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('worker_lock_release', {
      p_name: 'ingest',
      p_owner: 'a',
    });
  });

  it('returns false on RPC error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = mockClient(async () => ({ data: null, error: { message: 'boom' } }));
    await expect(releaseWorkerLock(client, 'ingest', 'a')).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('is a no-op without an owner', async () => {
    const client = mockClient(async () => ({ data: true, error: null }));
    await expect(releaseWorkerLock(client, 'ingest', null)).resolves.toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe('startLockHeartbeat', () => {
  it('extends the lease periodically until stopped', () => {
    vi.useFakeTimers();
    const client = mockClient(async () => ({ data: true, error: null }));

    const stop = startLockHeartbeat(client, 'ingest', {
      owner: 'a',
      ttlSeconds: 60,
      intervalMs: 1000,
    });

    expect(client.rpc).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(client.rpc).toHaveBeenCalledTimes(3);

    stop();
    vi.advanceTimersByTime(5000);
    expect(client.rpc).toHaveBeenCalledTimes(3);
  });
});
