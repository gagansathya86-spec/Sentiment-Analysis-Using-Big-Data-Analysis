import test from 'node:test';
import assert from 'node:assert/strict';
import { formatApiError } from './apiError.js';

test('formats a string or a structured message', () => {
  assert.equal(formatApiError('Network unavailable'), 'Network unavailable');
  assert.equal(formatApiError({ message: 'Connection failed' }), 'Connection failed');
});

test('formats detail strings and nested detail objects safely', () => {
  assert.equal(formatApiError({ detail: 'Not authorized' }), 'Not authorized');
  assert.equal(formatApiError({ detail: { message: 'Rate limited' } }), 'Rate limited');
  assert.equal(formatApiError({ detail: { unknown: true } }, 'Request failed'), 'Request failed');
});

test('preserves labelled Meta rate-limit diagnostics', () => {
  assert.equal(
    formatApiError({ detail: { message: 'Please retry', meta_code: 4, retry_after_seconds: 12, rate_limit_source: 'local_cooldown' } }),
    'Please retry (Meta code: 4 · Retry after: 12 seconds · Rate-limit source: Local cooldown)'
  );
});

test('uses fallback for null values and redacts token-like text', () => {
  assert.equal(formatApiError(null), 'The request failed. Please try again.');
  assert.equal(formatApiError('Failed for access_token=secret-value'), 'Failed for access_token=[redacted]');
  assert.equal(formatApiError('Authorization: Bearer abc.def.ghi'), 'Authorization: Bearer [redacted]');
});
