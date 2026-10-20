import { describe, it, expect } from 'vitest';
import { parseMatchingArgs, ALL_ACTIVE_LOOKBACK_HOURS } from '../../scripts/matching/args.js';

describe('matching CLI arguments', () => {
  it('defaults to a global run with notifications enabled', () => {
    expect(parseMatchingArgs([])).toEqual({
      jobId: null,
      userId: null,
      sinceHours: null,
      limitJobs: null,
      enqueueNotifications: true,
    });
  });

  it('parses every supported flag', () => {
    const opts = parseMatchingArgs([
      '--job',
      'job-1',
      '--user',
      'user-1',
      '--since-hours',
      '168',
      '--limit-jobs',
      '250',
      '--no-notify',
    ]);
    expect(opts).toMatchObject({
      jobId: 'job-1',
      userId: 'user-1',
      sinceHours: 168,
      limitJobs: 250,
      enqueueNotifications: false,
    });
  });

  it('treats --all-active as no practical discovered_at window', () => {
    expect(parseMatchingArgs(['--all-active']).sinceHours).toBe(ALL_ACTIVE_LOOKBACK_HOURS);
  });

  it('accepts --since-hours 0', () => {
    expect(parseMatchingArgs(['--since-hours', '0']).sinceHours).toBe(0);
  });

  it('ignores invalid numbers instead of producing NaN', () => {
    const opts = parseMatchingArgs(['--since-hours', 'abc', '--limit-jobs', '-5']);
    expect(opts.sinceHours).toBeNull();
    expect(opts.limitJobs).toBeNull();
  });

  it('does not swallow the next flag when a value is missing', () => {
    const opts = parseMatchingArgs(['--job', '--no-notify']);
    expect(opts.jobId).toBeNull();
    expect(opts.enqueueNotifications).toBe(false);
  });
});
