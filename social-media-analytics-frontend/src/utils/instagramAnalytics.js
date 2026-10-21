export const sentimentNames = ['positive', 'negative', 'neutral'];

export const isClassified = (item) => sentimentNames.includes(String(item?.sentiment || '').toLowerCase());

export const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const countSentiments = (items) => Object.fromEntries(
  sentimentNames.map((name) => [name, items.filter((item) => String(item?.sentiment || '').toLowerCase() === name).length]),
);

export const sentimentRows = (items) => sentimentNames
  .map((name) => ({ name, value: items.filter((item) => String(item?.sentiment || '').toLowerCase() === name).length }))
  .filter((row) => row.value > 0);

/** Build chart series only from real, valid media/comment timestamps. */
export const deriveInstagramActivity = (media, analyzedComments) => {
  const mediaByDate = new Map();
  const commentsByDate = new Map();
  const hours = new Map();
  for (const post of media) {
    const date = validDate(post.created_time);
    if (!date) continue;
    const key = date.toISOString().slice(0, 10);
    const item = mediaByDate.get(key) || { date: key, media: 0 };
    item.media += 1;
    mediaByDate.set(key, item);
    const hour = date.getHours();
    const row = hours.get(hour) || { hour: `${String(hour).padStart(2, '0')}:00`, media: 0, comments: 0 };
    row.media += 1;
    hours.set(hour, row);
  }
  for (const comment of analyzedComments) {
    const date = validDate(comment.created_time || comment.timestamp);
    if (!date) continue;
    const key = date.toISOString().slice(0, 10);
    const item = commentsByDate.get(key) || { date: key, comments: 0, positive: 0, negative: 0, neutral: 0 };
    item.comments += 1;
    const sentiment = String(comment.sentiment || '').toLowerCase();
    if (sentimentNames.includes(sentiment)) item[sentiment] += 1;
    commentsByDate.set(key, item);
    const hour = date.getHours();
    const row = hours.get(hour) || { hour: `${String(hour).padStart(2, '0')}:00`, media: 0, comments: 0 };
    row.comments += 1;
    hours.set(hour, row);
  }
  return {
    mediaTrend: [...mediaByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    commentTrend: [...commentsByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    hourlyActivity: [...hours.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
  };
};
