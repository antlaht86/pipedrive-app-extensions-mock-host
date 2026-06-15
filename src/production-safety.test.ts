import { afterEach, expect, test, vi } from 'vitest';
import { startPipedriveMockHost } from './index.js';

// Production-safety guards (ADR-0007). These are pure environment logic, so they
// run in the jsdom unit project where process.env is real and stubbable — unlike
// the browser project, where Vite shims process.env.

afterEach(() => {
  document.querySelectorAll('pipedrive-mock-host').forEach((el) => el.remove());
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('config.enabled false returns an inert host that renders nothing', () => {
  const host = startPipedriveMockHost({ enabled: false });

  expect(document.querySelector('pipedrive-mock-host')).toBeNull();
  expect(host.getCalls()).toEqual([]);
  host.teardown();
});

test('warns and stays inert when NODE_ENV is production', () => {
  vi.stubEnv('NODE_ENV', 'production');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  const host = startPipedriveMockHost();

  expect(warn).toHaveBeenCalled();
  expect(document.querySelector('pipedrive-mock-host')).toBeNull();
  host.teardown();
});
