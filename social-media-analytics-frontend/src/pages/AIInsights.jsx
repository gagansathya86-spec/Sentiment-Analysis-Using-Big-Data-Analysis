import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Lightbulb, TrendingUp, MessageSquareText, Award, Clock3 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { getFacebookDashboardAnalytics, getEngagementOverview, getBestPostingTimes, getApiErrorMessage } from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { usePlatform } from '../context/PlatformContext';

const validCount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const percent = (part, total) => validCount(part) !== null && validCount(total) > 0 ? `${((part / total) * 100).toFixed(1)}%` : '—';
const count = (value) => validCount(value) === null ? '—' : value.toLocaleString();
const shortDate = (date) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const utcTimestamp = (value) => {
  if (!value || Number.isNaN(Date.parse(value))) return 'Timestamp unavailable';
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`;
};

const AIInsights = () => {
  const { platform } = usePlatform();
  const [analytics, setAnalytics] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [postingTimes, setPostingTimes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getFacebookDashboardAnalytics(platform), getEngagementOverview(platform), getBestPostingTimes(platform)])
      .then(([dashboardResponse, engagementResponse, timesResponse]) => {
        if (!cancelled) {
          setAnalytics(dashboardResponse.data);
          setEngagement(engagementResponse.data);
          setPostingTimes(timesResponse.data);
        }
      })
      .catch((requestError) => { if (!cancelled) setError(getApiErrorMessage(requestError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [platform]);

  const sentimentTrend = useMemo(() => {
    const trend = analytics?.trends?.trend_by_date;
    if (!trend || typeof trend !== 'object') return [];
    return Object.entries(trend).filter(([date, values]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && values && typeof values === 'object')
      .map(([date, values]) => ({ date, positive: validCount(values.positive), negative: validCount(values.negative), neutral: validCount(values.neutral) }))
      .filter((row) => row.positive !== null || row.negative !== null || row.neutral !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [analytics]);

  const engagementTrend = useMemo(() => (engagement?.engagement_by_date || [])
    .filter((row) => typeof row.date === 'string' && !Number.isNaN(Date.parse(`${row.date}T00:00:00Z`)) && validCount(row.average_engagement) !== null && validCount(row.posts) > 0)
    .sort((a, b) => a.date.localeCompare(b.date)), [engagement]);

  if (loading) return <PageSkeleton type="dashboard" />;

  const sentiment = analytics?.sentiment;
  const totalSentiment = validCount(sentiment?.total);
  const positive = validCount(sentiment?.counts?.positive);
  const negative = validCount(sentiment?.counts?.negative);
  const neutral = validCount(sentiment?.counts?.neutral);
  const comparableCount = validCount(engagement?.comparable_post_count);
  const averageEngagement = validCount(engagement?.comparable_average_engagement_per_post);
  const bestPosts = engagement?.best_comparable_posts || [];
  const weakerPosts = engagement?.weaker_comparable_posts || [];
  const sufficientlyComparable = comparableCount !== null && comparableCount >= 6 && bestPosts.length > 0 && weakerPosts.length > 0;
  const latestSentiment = sentimentTrend.length >= 2 ? sentimentTrend.at(-1) : null;
  const previousSentiment = sentimentTrend.length >= 2 ? sentimentTrend.at(-2) : null;
  const positiveChange = latestSentiment && previousSentiment && latestSentiment.positive !== null && previousSentiment.positive !== null ? latestSentiment.positive - previousSentiment.positive : null;
  const negativeChange = latestSentiment && previousSentiment && latestSentiment.negative !== null && previousSentiment.negative !== null ? latestSentiment.negative - previousSentiment.negative : null;
  const engagementChange = engagementTrend.length >= 4 ? (() => {
    const midpoint = Math.floor(engagementTrend.length / 2);
    const early = engagementTrend.slice(0, midpoint);
    const recent = engagementTrend.slice(midpoint);
    const average = (rows) => {
      const posts = rows.reduce((sum, row) => sum + row.posts, 0);
      return posts ? rows.reduce((sum, row) => sum + row.average_engagement * row.posts, 0) / posts : null;
    };
    return { early: average(early), recent: average(recent), earlyCount: early.length, recentCount: recent.length };
  })() : null;
  const sentimentDateRange = sentimentTrend.length ? `${shortDate(sentimentTrend[0].date)} – ${shortDate(sentimentTrend.at(-1).date)} UTC` : 'Unavailable';
  const engagementDateRange = engagementTrend.length ? `${shortDate(engagementTrend[0].date)} – ${shortDate(engagementTrend.at(-1).date)} UTC` : 'Unavailable';
  const platformName = platform === 'instagram' ? 'Instagram' : 'Facebook';
  const scope = analytics?.account_id ? `Selected ${platformName} account/page` : `All stored ${platformName} accounts/pages`;
  const suggestions = [];

  if (!error && postingTimes?.available && postingTimes.recommendations?.length) {
    const time = postingTimes.recommendations[0];
    suggestions.push({
      title: 'Test a historically stronger posting window',
      suggestion: `Publish a small set of upcoming ${platformName} posts on ${time.day} during ${time.window} ${postingTimes.timezone || 'UTC'}, then compare with posts at other times.`,
      evidence: `${time.avg_engagement} average weighted interactions per post across ${time.scored_posts} comparable posts (${(postingTimes.score_basis?.metrics || []).join(', ')}). The recommendation is scoped to ${postingTimes.account_id ? 'the selected page' : 'all stored Facebook pages'}.`,
      sample: `${time.scored_posts} comparable posts in this window; ${postingTimes.scored_posts} comparable timestamped posts overall.`,
      limitation: time.tentative ? 'Tentative: the total comparable history is below 10 posts or this window has fewer than 5 posts. Historical association does not predict future results.' : 'Historical association does not show that posting time caused the engagement.',
      experiment: 'Keep content format and topic as consistent as practical, record the published UTC time, and compare weighted interactions per post after the same observation period.',
    });
  } else if (!error) {
    suggestions.push({ title: 'Collect enough history to compare posting times', suggestion: 'Continue storing timestamped posts with consistent observed engagement metrics before choosing a posting window.', evidence: postingTimes?.availability_reason || 'No time bucket currently meets the endpoint minimum sample requirements.', sample: `${count(postingTimes?.scored_posts)} comparable timestamped posts are available.`, limitation: 'A small or incomplete history cannot support a reliable time ranking.', experiment: 'After at least two comparable posts land in a time bucket, compare more buckets as the sample grows; treat findings as tentative until there are at least 10 comparable posts.', });
  }

  if (!error && negativeChange !== null && negativeChange > 0) {
    suggestions.push({ title: 'Inspect the latest negative-sentiment increase', suggestion: `Review the analyzed posts and comments from ${latestSentiment.date} and compare them with ${previousSentiment.date}.`, evidence: `Daily negative labels rose by ${negativeChange} (${previousSentiment.negative} to ${latestSentiment.negative}) between the two latest dates in ${sentimentDateRange}.`, sample: `${previousSentiment.negative + latestSentiment.negative} negative labels across those two dates; these daily counts are part of ${count(totalSentiment)} analyzed items overall.`, limitation: 'A two-date count change does not establish why sentiment changed or whether it will continue.', experiment: 'Read the associated text, record any recurring topic, and monitor the next dates before deciding whether to adjust content or respond.', });
  }

  if (!error && sufficientlyComparable) {
    suggestions.push({ title: 'Compare higher- and lower-engagement posts', suggestion: 'Review the highest and lowest engagement posts and test one observable content change at a time.', evidence: `${comparableCount} posts share the same observed engagement metric basis: ${(engagement.comparable_metric_basis || []).join(', ')}; scores use the existing weighted formula.`, sample: `${comparableCount} comparable posts.`, limitation: 'Engagement measures interactions; it does not indicate whether text sentiment is positive. These comparisons do not establish causation.', experiment: 'Choose one change, such as the opening line, then compare subsequent posts on the same metric basis and observation period.', });
  }

  const contentComparison = engagement?.content_type_comparison;
  if (!error && contentComparison?.available && contentComparison.types?.length >= 2) {
    const types = contentComparison.types;
    suggestions.push({ title: 'Run a content-type comparison', suggestion: `Compare ${types[0].type} and ${types[1].type} posts using the same engagement fields and a similar observation period.`, evidence: types.slice(0, 2).map((item) => `${item.type}: ${item.comparable_average_engagement} average across ${item.comparable_posts} posts`).join('; '), sample: `${types.slice(0, 2).reduce((sum, item) => sum + item.comparable_posts, 0)} posts across two labeled types.`, limitation: 'The observed difference is descriptive and may reflect other differences between posts.', experiment: 'Publish at least three posts per type under comparable conditions and compare their weighted interactions per post.', });
  } else if (!error) {
    const observedTypes = contentComparison?.types || [];
    suggestions.push({ title: 'Collect consistently labeled content types', suggestion: 'Add reliable media-type labels to stored posts so engagement can be compared across actual content types.', evidence: observedTypes.length ? `Observed labels: ${observedTypes.map((item) => `${item.type} (${item.comparable_posts})`).join(', ')}; the two-type comparison threshold is not met.` : 'No distinct content-type labels are currently available.', sample: `${count(contentComparison?.labeled_comparable_posts)} comparable posts have usable content-type labels; at least three posts in each of two types are required.`, limitation: 'No content-type winner can be identified from the current labels and sample.', experiment: 'Track at least three comparable posts for each of two genuinely distinct, consistently labeled types, then review their average engagement.', });
  }

  if (!error && !suggestions.length) {
    suggestions.push({ title: 'Build a larger comparable history', suggestion: 'Continue collecting analyzed sentiment and posts with timestamps and consistent engagement fields.', evidence: `Current sentiment trend dates: ${sentimentDateRange}; comparable engagement dates: ${engagementDateRange}.`, sample: `${count(totalSentiment)} analyzed sentiment items and ${count(comparableCount)} comparable posts.`, limitation: 'Missing labels, timestamps, or engagement metrics reduce which comparisons are available.', experiment: 'Keep future records complete and evaluate the trend again as additional dated observations arrive.', });
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <SectionHeader title="AI Insights" subtitle="Transparent, rule-based observations from Projecti analytics. No generative or trained AI model is used on this page." />
      {error && <p role="alert" style={{ color: 'var(--error)' }}>Could not load insight data ({error}).</p>}
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '-1rem', marginBottom: '1.25rem' }}>Scope: {scope}. Suggestions are prompts for investigation, not claims about cause or guaranteed outcomes.</p>

      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <MetricCard title="Analyzed Sentiment" value={count(totalSentiment)} subtitle="Posts and comments with supported sentiment labels" icon={MessageSquareText} />
        <MetricCard title="Positive Sentiment" value={percent(positive, totalSentiment)} subtitle={`${count(positive)} positive labels`} icon={TrendingUp} color="var(--success)" />
        <MetricCard title="Negative Sentiment" value={percent(negative, totalSentiment)} subtitle={`${count(negative)} negative labels`} icon={TrendingUp} color="var(--error)" />
        <MetricCard title="Neutral Sentiment" value={percent(neutral, totalSentiment)} subtitle={`${count(neutral)} neutral labels`} icon={MessageSquareText} />
        <MetricCard title="Comparable Posts" value={count(comparableCount)} subtitle={(engagement?.comparable_metric_basis || []).join(', ') || 'No common engagement metrics'} icon={Award} />
        <MetricCard title="Average Engagement" value={averageEngagement === null ? '—' : averageEngagement.toFixed(2)} subtitle={averageEngagement === null ? 'Unavailable for a consistent metric basis' : 'Weighted interactions per comparable post'} icon={TrendingUp} />
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '-0.75rem', marginBottom: '1.5rem' }}>Sentiment date range: {sentimentDateRange} · Engagement date range: {engagementDateRange}. A missing range means no valid dated observations were supplied.</p>

      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <ChartCard title="Daily Sentiment Counts" subtitle={`Analyzed item counts by label · ${sentimentDateRange}`} height="330px">
          {sentimentTrend.length >= 2 ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sentimentTrend} margin={{ top: 12, right: 18, left: 4, bottom: 38 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} angle={-25} textAnchor="end" height={52} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} label={{ value: 'Analyzed items per day', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
              <RechartsTooltip labelFormatter={(date) => `${shortDate(date)} UTC`} />
              <Legend />
              <Line dataKey="positive" name="Positive" stroke="var(--success)" strokeWidth={2} connectNulls={false} dot={false} />
              <Line dataKey="negative" name="Negative" stroke="var(--error)" strokeWidth={2} connectNulls={false} dot={false} />
              {sentimentTrend.some((row) => row.neutral !== null) && <Line dataKey="neutral" name="Neutral" stroke="var(--warning)" strokeWidth={2} connectNulls={false} dot={false} />}
            </LineChart>
          </ResponsiveContainer> : <EmptyState icon={TrendingUp} title={error ? 'Sentiment trend unavailable' : 'Not enough trend history'} description={error || 'At least two dates with valid analyzed sentiment are needed to show a trend.'} />}
        </ChartCard>

        <ChartCard title="Comparable Engagement Over Time" subtitle={`Average weighted interactions per post · ${engagementDateRange}`} height="330px">
          {engagementTrend.length >= 4 ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={engagementTrend} margin={{ top: 12, right: 18, left: 4, bottom: 38 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} angle={-25} textAnchor="end" height={52} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} label={{ value: 'Weighted interactions per post', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
              <RechartsTooltip labelFormatter={(date) => `${shortDate(date)} UTC`} formatter={(value, _name, item) => [value, `${item.payload.posts} comparable posts`]} />
              <Line dataKey="average_engagement" name="Average per post" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer> : <EmptyState icon={TrendingUp} title={error ? 'Engagement trend unavailable' : 'Not enough engagement history'} description={error || 'At least four separate dates with comparable post metrics are needed to compare earlier and recent periods.'} />}
        </ChartCard>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Performance Summary</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Engagement measures interactions; sentiment describes the emotional polarity of analyzed text. A negative post can receive high engagement, and a positive post can receive low engagement. Neither measure implies the other.</p>
        {error ? <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Summary unavailable because the analytics request failed.</p> : totalSentiment !== null && totalSentiment > 0 ? <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Across {count(totalSentiment)} analyzed items, {percent(positive, totalSentiment)} were positive, {percent(negative, totalSentiment)} were negative, and {percent(neutral, totalSentiment)} were neutral.
        </p> : <p style={{ color: 'var(--text-muted)' }}>No analyzed sentiment is available for this page yet.</p>}
        {averageEngagement !== null
          ? <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Average engagement: {averageEngagement.toFixed(2)} weighted interactions per post across {count(comparableCount)} posts with the same observed metrics ({(engagement.comparable_metric_basis || []).join(', ')}). Posts with missing included metrics are excluded.</p>
          : <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Average engagement is unavailable because there are not enough consistently observed metrics.</p>}
        {positiveChange !== null && negativeChange !== null && <p style={{ color: 'var(--text-muted)', marginBottom: 0, marginTop: '0.75rem' }}>From {previousSentiment.date} to {latestSentiment.date}, positive labels changed by {positiveChange > 0 ? '+' : ''}{positiveChange} and negative labels by {negativeChange > 0 ? '+' : ''}{negativeChange}. This is an observed count change and does not identify its cause.</p>}
      </div>

      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {[{ title: 'Highest-engagement posts', posts: bestPosts, icon: Award }, { title: 'Lowest-engagement posts', posts: weakerPosts, icon: MessageSquareText }].map((group) => <div className="card" key={group.title}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>{group.title}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>Engagement rank is based on weighted interactions; sentiment is shown separately.</p>
          {error ? <p style={{ color: 'var(--text-muted)' }}>Post comparison unavailable because the analytics request failed.</p> : sufficientlyComparable ? group.posts.map((post) => <div key={`${group.title}-${post.id}`} style={{ padding: '0.8rem 0', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}><span>{utcTimestamp(post.created_time)}</span><strong>Engagement score {post.score}</strong></div>
            <p style={{ margin: '0.45rem 0', lineHeight: 1.45 }}>{post.text || 'Post text unavailable'}</p>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{Object.entries(post.metrics || {}).filter(([, value]) => value !== null).map(([name, value]) => `${name}: ${value}`).join(' · ') || 'Metrics unavailable'} · Sentiment: {post.sentiment || 'Unavailable'}</span>
          </div>) : <EmptyState icon={group.icon} title="Comparison unavailable" description={`At least six posts with the same observed metric fields are needed to show distinct high and low engagement groups. Current comparable sample: ${count(comparableCount)}.`} />}
        </div>)}
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem', fontSize: '1.1rem' }}><Lightbulb size={19} color="var(--warning)" /> Evidence-based Recommendations</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Suggestions come from explicit data rules. Each is a hypothesis to test, not a causal conclusion.</p>
        {error ? <p style={{ color: 'var(--text-muted)' }}>Recommendations are unavailable because the analytics request failed.</p> : suggestions.map((item) => <article key={item.title} style={{ padding: '0.9rem 0', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 0.45rem', fontSize: '0.95rem' }}>{item.title}</h3>
          <p style={{ margin: '0 0 0.45rem', lineHeight: 1.5 }}><strong>Suggestion:</strong> {item.suggestion}</p>
          <p style={{ margin: '0 0 0.35rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}><strong>Evidence:</strong> {item.evidence}</p>
          <p style={{ margin: '0 0 0.35rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}><strong>Sample:</strong> {item.sample}</p>
          <p style={{ margin: '0 0 0.35rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}><strong>Limitation:</strong> {item.limitation}</p>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}><strong>Experiment:</strong> {item.experiment}</p>
        </article>)}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}><BrainCircuit size={15} /> Rule-based insights using stored Projecti analytics; no external AI provider or model is called.</div>
    </div>
  );
};

export default AIInsights;
