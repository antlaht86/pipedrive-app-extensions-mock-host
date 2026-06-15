import { expect, test } from 'vitest';
import { VERSION } from './index.js';

test('exposes a version string', () => {
  expect(typeof VERSION).toBe('string');
});
