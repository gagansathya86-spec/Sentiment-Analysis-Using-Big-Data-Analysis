import React, { useEffect, useState, useContext } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { DatasetContext } from '../context/DatasetContext';
import { getSentimentTrends, getPostingFrequency } from '../services/api';
import ChartCard from '../components/ui/ChartCard';
import SectionHeader from '../components/ui/SectionHeader';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' },
    itemStyle: { color: 'var(--text-main)' }
  }
};

export const Trends = () => {
  const { datasetId } = useContext(DatasetContext);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (datasetId) {
      Promise.all([
        getSentimentTrends(datasetId).catch(() => ({ data: {} })),
        getPostingFrequency(datasetId).catch(() => ({ data: {} }))
      ]).then(([trendsRes, postRes]) => {
        const trends = trendsRes.data.trend_by_date || {};
        const posts = postRes.data.posts_by_date || {};
        
        const mergedData = Object.keys(trends).map(date => ({
          date,
          ...trends[date],
          total: posts[date] || 0
        })).sort((a,b) => new Date(a.date) - new Date(b.date));
        
        setTrendData(mergedData);
        setLoading(false);
      });
    }
  }, [datasetId]);

  if (loading) return <PageSkeleton type="dashboard" />;

  return (
    <div>
      <SectionHeader 
        title="Trend Analysis" 
        subtitle="Monitor social media activity and sentiment over time."
      />

      <ChartCard title="Sentiment Trends Over Time" height="400px">
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid {...CHART_STYLES.grid} />
              <XAxis dataKey="date" {...CHART_STYLES.axis} />
              <YAxis {...CHART_STYLES.axis} />
              <RechartsTooltip {...CHART_STYLES.tooltip} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="positive" stroke="var(--success)" strokeWidth={3} dot={{r: 4}} />
              <Line type="monotone" dataKey="negative" stroke="var(--error)" strokeWidth={3} dot={{r: 4}} />
              <Line type="monotone" dataKey="neutral" stroke="var(--text-muted)" strokeWidth={3} dot={{r: 4}} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No Trend Data" description="Not enough temporal data." />
        )}
      </ChartCard>
      
      <div style={{ marginTop: '2rem' }}>
        <ChartCard title="Posting Activity Over Time" height="350px">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="date" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={3} dot={{r: 4}} name="Total Posts" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No Posting Data" description="Not enough temporal data." />
          )}
        </ChartCard>
      </div>
    </div>
  );
};
