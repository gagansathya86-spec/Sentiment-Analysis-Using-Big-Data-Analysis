import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeCommentSentiment } from './commentSentiment.js';
import { parseMetricValue } from './metricValue.js';

test('calculates displayed percentages and selected-post chart data from analyzed counts', () => {
  const result = summarizeCommentSentiment({
    positive_count: 3,
    negative_count: 2,
    neutral_count: 0,
    unknown_count: 0,
    // Deliberately irrelevant: this helper derives the denominator from labels.
    comments_analyzed: 99,
  });

  assert.equal(result.comments_analyzed, 5);
  assert.deepEqual(result.percentages, { positive: 60, negative: 40, neutral: 0 });
  assert.deepEqual(result.chartData, [
    { name: 'positive', label: 'Positive', value: 3, percentage: 60 },
    { name: 'negative', label: 'Negative', value: 2, percentage: 40 },
  ]);
  assert.deepEqual(result.cards.map(({ title, value }) => ({ title, value })), [
    { title: 'Positive', value: '3 comments (60%)' },
    { title: 'Negative', value: '2 comments (40%)' },
    { title: 'Neutral', value: '0 comments (0%)' },
  ]);
  assert.equal(parseMetricValue(result.cards[0].value), null, 'MetricCard must render the full sentiment label instead of animating its leading count');
});

test('handles zero analyzed comments without NaN or Infinity', () => {
  const result = summarizeCommentSentiment({ positive_count: 0, negative_count: 0, neutral_count: 0, unknown_count: 4 });
  assert.equal(result.comments_analyzed, 0);
  assert.deepEqual(result.percentages, { positive: 0, negative: 0, neutral: 0 });
  assert.deepEqual(result.chartData, []);
  assert.equal(result.unanalyzed_count, 4);
});

test('uses only the selected post summary and sanitizes malformed counts', () => {
  const result = summarizeCommentSentiment({ positive_count: '2', negative_count: -8, neutral_count: 'bad' });
  assert.equal(result.comments_analyzed, 2);
  assert.deepEqual(result.chartData.map(({ name, value }) => ({ name, value })), [{ name: 'positive', value: 2 }]);
});

test('keeps CountUp parsing for standalone numeric and percentage cards', () => {
  assert.deepEqual(parseMetricValue(42), { num: 42, suffix: '' });
  assert.deepEqual(parseMetricValue('60%'), { num: 60, suffix: '%' });
  assert.equal(parseMetricValue('3 comments (60%)'), null);
});
