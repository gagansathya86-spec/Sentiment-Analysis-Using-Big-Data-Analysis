import test from 'node:test';
import assert from 'node:assert/strict';
import { countSentiments, deriveInstagramActivity, isClassified, sentimentRows, validDate } from './instagramAnalytics.js';

test('caption sentiment summaries count classified media only and preserve zero categories', () => {
  const media = [{ sentiment: 'positive' }, { sentiment: 'neutral' }, { sentiment: 'unknown' }, {}];
  const classified = media.filter(isClassified);
  assert.deepEqual(countSentiments(classified), { positive: 1, negative: 0, neutral: 1 });
  assert.deepEqual(sentimentRows(classified), [{ name: 'positive', value: 1 }, { name: 'neutral', value: 1 }]);
});

test('activity charts require valid timestamps and use actual observed hours only', () => {
  const charts = deriveInstagramActivity(
    [{ id: 'valid', created_time: '2026-10-21T10:00:00Z' }, { id: 'invalid', created_time: 'unavailable' }],
    [{ id: 'comment', created_time: '2026-10-21T10:25:00Z', sentiment: 'positive' }],
  );
  assert.equal(charts.mediaTrend.length, 1);
  assert.equal(charts.mediaTrend[0].media, 1);
  assert.equal(charts.commentTrend[0].positive, 1);
  const expectedHour = `${String(new Date('2026-10-21T10:00:00Z').getHours()).padStart(2, '0')}:00`;
  assert.deepEqual(charts.hourlyActivity.map((row) => row.hour), [expectedHour]);
  assert.equal(validDate('bad timestamp'), null);
});
