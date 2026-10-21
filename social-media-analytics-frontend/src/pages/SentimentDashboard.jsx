import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getFacebookDashboardAnalytics, getApiErrorMessage } from '../services/api';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { usePlatform } from '../context/PlatformContext';

const COLORS = {
  positive: 'var(--success)',
  negative: 'var(--error)',
  neutral: 'var(--text-muted)'
};
const SENTIMENTS = ['positive', 'negative', 'neutral'];

const validCount = (value) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
);
const formatCount = (value) => {
  const count = validCount(value);
  return count === null ? '—' : count.toLocaleString();
};
const formatPercent = (count, total) => {
  const value = validCount(count);
  const denominator = validCount(total);
  return value === null || denominator === null || denominator === 0
    ? '—'
    : `${((value / denominator) * 100).toFixed(1)}%`;
};

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' },
    itemStyle: { color: 'var(--text-main)' }
  }
};

export const SentimentDashboard = () => {
  const { platform } = usePlatform();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFacebookDashboardAnalytics(platform)
      .then(({ data }) => {
        if (!cancelled) {
          setAnalytics(data);
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setAnalytics(null);
          setError(getApiErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [platform]);

  if (loading) return <PageSkeleton type="dashboard" />;

  const sentiment = analytics?.sentiment;
  const counts = sentiment?.counts || {};
  const total = validCount(sentiment?.total);
  const sentimentAvailable = sentiment?.available === true && total !== null && total > 0;
  const sentimentData = sentimentAvailable
    ? SENTIMENTS.map((name) => ({ name, value: validCount(counts[name]) })).filter((item) => item.value !== null && item.value > 0)
    : [];
  const trends = analytics?.trends;
  const trendData = trends?.trend_by_date && typeof trends.trend_by_date === 'object'
    ? Object.entries(trends.trend_by_date)
      .filter(([date, values]) => !Number.isNaN(Date.parse(date)) && values && typeof values === 'object')
      .map(([date, values]) => ({
        date,
        ...Object.fromEntries(SENTIMENTS.map((label) => [label, validCount(values[label]) ?? 0]))
      }))
      .filter((row) => SENTIMENTS.some((label) => row[label] > 0))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];
  const trendAvailable = trends?.available === true && trendData.length > 0;
  const pageScope = analytics?.account_id ? 'the selected Facebook page' : 'all stored Facebook pages';

  return (
    <div>
      <SectionHeader 
        title="Sentiment Dashboard" 
        subtitle={`Sentiment from analyzed posts and comments in ${pageScope}.`}
      />

      {error && <p role="alert" style={{ color: 'var(--error)' }}>Facebook analytics could not be loaded ({error}).</p>}

      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <MetricCard 
          title="Positive Sentiment"
          value={formatPercent(counts.positive, total)}
          subtitle={sentimentAvailable ? `${formatCount(counts.positive)} total` : 'No analyzed records'}
          icon={TrendingUp}
          color={COLORS.positive}
        />
        <MetricCard 
          title="Negative Sentiment"
          value={formatPercent(counts.negative, total)}
          subtitle={sentimentAvailable ? `${formatCount(counts.negative)} total` : 'No analyzed records'}
          icon={TrendingDown}
          color={COLORS.negative}
        />
        <MetricCard 
          title="Neutral Sentiment"
          value={formatPercent(counts.neutral, total)}
          subtitle={sentimentAvailable ? `${formatCount(counts.neutral)} total` : 'No analyzed records'}
          icon={Minus}
          color={COLORS.neutral}
        />
      </div>

      <div className="grid-2">
        <ChartCard title="Sentiment Distribution">
          {sentimentData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${formatCount(value)}`} stroke="none">
                  {sentimentData.map((e, i) => <Cell key={i} fill={COLORS[e.name.toLowerCase()] || 'var(--primary)'} />)}
                </Pie>
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Legend style={{ textTransform: 'capitalize' }} wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No Analyzed Sentiment" description={error ? 'Could not retrieve Facebook sentiment results.' : 'No analyzed Facebook posts or comments are available for the selected page.'} />
          )}
        </ChartCard>
        
        <ChartCard title="Sentiment Trends Over Time">
          {trendAvailable ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="date" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {trends?.sentiment_classes?.map(cls => (
                  <Line key={cls} type="monotone" dataKey={cls} name={cls} stroke={COLORS[cls] || 'var(--primary)'} strokeWidth={3} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No Trend Data" description="A trend requires analyzed sentiment with valid post or comment timestamps." />
          )}
        </ChartCard>
      </div>
    </div>
  );
};
