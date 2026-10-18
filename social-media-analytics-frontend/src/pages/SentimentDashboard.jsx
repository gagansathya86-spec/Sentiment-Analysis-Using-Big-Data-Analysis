import React, { useEffect, useState, useContext } from 'react';
import { PieChartIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DatasetContext } from '../context/DatasetContext';
import { getSentimentDistribution, getSentimentTrends } from '../services/api';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';

const COLORS = {
  positive: 'var(--success)',
  negative: 'var(--error)',
  neutral: 'var(--text-muted)'
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
  const { datasetId } = useContext(DatasetContext);
  const [dist, setDist] = useState(null);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (datasetId) {
      Promise.all([
        getSentimentDistribution(datasetId).catch(() => ({ data: null })),
        getSentimentTrends(datasetId).catch(() => ({ data: null }))
      ]).then(([resDist, resTrends]) => {
        if (resDist.data) setDist(resDist.data);
        if (resTrends.data) setTrends(resTrends.data);
        setLoading(false);
      });
    }
  }, [datasetId]);

  if (loading) return <PageSkeleton type="dashboard" />;

  const sentimentData = dist?.counts 
    ? Object.entries(dist.counts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0)
    : [];
    
  const trendData = trends?.trend_by_date
    ? Object.entries(trends.trend_by_date).map(([date, counts]) => ({ date, ...counts })).sort((a,b) => new Date(a.date) - new Date(b.date))
    : [];

  const total = dist?.total || sentimentData.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div>
      <SectionHeader 
        title="Sentiment Dashboard" 
        subtitle="Detailed breakdown of audience sentiment and emotional valence."
      />

      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <MetricCard 
          title="Positive Sentiment"
          value={`${dist?.percentages?.positive?.toFixed(1) || ((dist?.counts?.positive || 0) / total * 100).toFixed(1)}%`}
          subtitle={`${dist?.counts?.positive || 0} total`}
          icon={TrendingUp}
          color={COLORS.positive}
        />
        <MetricCard 
          title="Negative Sentiment"
          value={`${dist?.percentages?.negative?.toFixed(1) || ((dist?.counts?.negative || 0) / total * 100).toFixed(1)}%`}
          subtitle={`${dist?.counts?.negative || 0} total`}
          icon={TrendingDown}
          color={COLORS.negative}
        />
        {dist?.counts?.neutral !== undefined && (
          <MetricCard 
            title="Neutral Sentiment"
            value={`${dist?.percentages?.neutral?.toFixed(1) || ((dist?.counts?.neutral || 0) / total * 100).toFixed(1)}%`}
            subtitle={`${dist?.counts?.neutral || 0} total`}
            icon={Minus}
            color={COLORS.neutral}
          />
        )}
      </div>

      <div className="grid-2">
        <ChartCard title="Sentiment Distribution">
          {sentimentData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="value" label stroke="none">
                  {sentimentData.map((e, i) => <Cell key={i} fill={COLORS[e.name.toLowerCase()] || 'var(--primary)'} />)}
                </Pie>
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Legend style={{ textTransform: 'capitalize' }} wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No Data" description="Sentiment has not been analyzed." />
          )}
        </ChartCard>
        
        <ChartCard title="Sentiment Trends Over Time">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="date" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {trends?.sentiment_classes?.map(cls => (
                  <Line key={cls} type="monotone" dataKey={cls} stroke={COLORS[cls] || 'var(--primary)'} strokeWidth={3} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No Trend Data" description="Temporal trend data is not available." />
          )}
        </ChartCard>
      </div>
    </div>
  );
};
