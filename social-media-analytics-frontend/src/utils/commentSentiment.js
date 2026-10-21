const SENTIMENTS = ['positive', 'negative', 'neutral'];

const safeCount = (value) => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

/** Build comment-only display totals and pie data from the selected post summary. */
export function summarizeCommentSentiment(summary = {}) {
  const counts = Object.fromEntries(SENTIMENTS.map((label) => [
    label,
    safeCount(summary[`${label}_count`]),
  ]));
  const analyzed = SENTIMENTS.reduce((total, label) => total + counts[label], 0);
  const percentages = Object.fromEntries(SENTIMENTS.map((label) => [
    label,
    analyzed ? Math.round((counts[label] * 10000) / analyzed) / 100 : 0,
  ]));
  const cards = SENTIMENTS.map((label) => ({
    name: label,
    title: `${label[0].toUpperCase()}${label.slice(1)}`,
    count: counts[label],
    percentage: percentages[label],
    value: `${counts[label]} comments (${percentages[label]}%)`,
  }));
  const chartData = SENTIMENTS
    .filter((label) => counts[label] > 0)
    .map((label) => ({
      name: label,
      label: `${label[0].toUpperCase()}${label.slice(1)}`,
      value: counts[label],
      percentage: percentages[label],
    }));

  return {
    ...counts,
    comments_analyzed: analyzed,
    unanalyzed_count: safeCount(summary.unanalyzed_count ?? summary.unknown_count),
    percentages,
    cards,
    chartData,
  };
}
