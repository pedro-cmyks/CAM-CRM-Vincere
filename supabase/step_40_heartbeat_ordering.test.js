import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// What step 41 has to have removed, and what it must not have removed with it.
//
// A live VPS on 2026-08-31 paired, captured, queued, and was then shown as
// offline forever because every heartbeat was refused. Part of that was in the
// agent; this half was in the database, and it had TWO copies of the same false
// rule rather than one. The first attempt at this migration removed only the
// copy that compares the submitted values and left the one that compares the
// effective values, which is the copy that actually rejects, so the migration
// would have deployed and changed nothing.
const migrationUrl = new URL('./step_40_heartbeat_ordering.sql', import.meta.url);
const trackerUrl = new URL('./DATABASE_TRACKER.md', import.meta.url);
const migrationExists = existsSync(migrationUrl);
const sql = migrationExists ? readFileSync(migrationUrl, 'utf8') : '';
const normalized = sql.toLowerCase().replace(/\s+/g, ' ');
const tracker = existsSync(trackerUrl) ? readFileSync(trackerUrl, 'utf8') : '';

describe('step 41 heartbeat ordering migration', () => {
  it('exists and is tracked', () => {
    expect(migrationExists).toBe(true);
    expect(tracker).toContain('supabase/step_40_heartbeat_ordering.sql');
  });

  it('replaces the heartbeat function rather than patching around it', () => {
    expect(normalized).toContain('create or replace function public.record_ingest_heartbeat');
  });

  it('rejects neither ordering of the submitted timestamps', () => {
    // An upload finishes after the capture it carries, so a success later than a
    // capture is the ordinary case. The reverse is ordinary too, once a capture
    // has happened since the last acknowledged upload.
    expect(normalized).not.toContain('p_last_success_at > p_last_capture_at');
  });

  it('rejects neither ordering of the effective timestamps', () => {
    // The one the first version of this migration missed. It compares after
    // merging the submitted values with the stored row, so it fires on devices
    // that have ever uploaded, which is every working device.
    expect(normalized).not.toContain('v_effective_success_at > v_effective_capture_at');
  });

  it('does not refuse a success recorded while no capture time is known', () => {
    // The same condition also rejected `capture is null and success is not`,
    // which is an ordinary state for a device that uploaded before a capture
    // timestamp was ever written.
    expect(normalized).not.toMatch(/v_effective_capture_at is null\s*or\s*v_effective_success_at/);
  });

  it('keeps the clock-skew guards, which are a different thing entirely', () => {
    // A timestamp ahead of the server is a real fault worth refusing. An
    // ordering between two honest timestamps is not, and removing the first
    // along with the second would have traded one bug for another.
    expect(normalized).toContain("p_last_capture_at > v_now + interval '5 minutes'");
    expect(normalized).toContain("p_last_success_at > v_now + interval '5 minutes'");
  });

  it('keeps the rest of the validation the function is responsible for', () => {
    for (const guard of [
      'p_queue_depth',
      'p_queue_bytes',
      'p_health_status',
      'p_min_interval_seconds',
    ]) {
      expect(normalized).toContain(guard);
    }
  });
});
