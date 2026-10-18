import React, { useEffect, useState, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ThumbsUp, Activity, BarChart2, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { DatasetContext } from '../context/DatasetContext';
import { getDashboard } from '../services/api';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';

const COLORS = {
  positive: 'var(--success)',
  negative: 'var(--error)',
  neutral: 'var(--text-muted)',
  primary: 'var(--primary)',
  secondary: '#8b5cf6',
  tertiary: '#f59e0b'
};

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' },
    itemStyle: { color: 'var(--text-main)' }
  }
};

const Dashboard = () => {
  const { datasetId } = useContext(DatasetContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!datasetId) {
      navigate('/upload');
      return;
    }

    const fetchData = async () => {
      try {
        const res = await getDashboard(datasetId);
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [datasetId, navigate]);

  if (loading) return <PageSkeleton type="dashboard" />;
  if (error) return <EmptyState title="Error Loading Dashboard" description={error} />;
  if (!data) return null;

  // Format data for Recharts
  const sentimentData = data.sentiment?.counts
    ? Object.entries(data.sentiment.counts)
        .map(([name, value]) => ({ name, value }))
        .filter(d => d.value > 0)
    : [];

  const trendData = data.sentiment?.trend_by_date
    ? Object.entries(data.sentiment.trend_by_date)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];

  const timeOfDayData = data.activity_by_time_of_day?.activity_by_period
    ? Object.entries(data.activity_by_time_of_day.activity_by_period).map(([name, value]) => ({ name, value }))
    : [];

  const totalPosts = data.total_rows || 0;
  const positiveCount = data.sentiment?.counts?.positive || 0;
  const negativeCount = data.sentiment?.counts?.negative || 0;
  const posRate = totalPosts > 0 ? ((positiveCount / totalPosts) * 100).toFixed(1) : 0;
  const negRate = totalPosts > 0 ? ((negativeCount / totalPosts) * 100).toFixed(1) : 0;

  return (
    <div>
      {/* Top Cards */}
      <div className="grid-4" style={{ marginBottom: '2rem' }}>
        <MetricCard 
          title="Total Processed" 
          value={totalPosts.toLocaleString()} 
          icon={MessageSquare} 
          subtitle="Rows in dataset" 
        />
        <MetricCard 
          title="Total Engagement" 
          value={data.engagement?.available && data.engagement?.total_engagement_score ? data.engagement.total_engagement_score.sum.toLocaleString() : 'N/A'} 
          icon={ThumbsUp}
          color={COLORS.secondary}
          subtitle={data.engagement?.available ? 'Sum of all likes/shares' : 'Engagement not mapped'}
        />
        <MetricCard 
          title="Positive Sentiment" 
          value={positiveCount.toLocaleString()}
          icon={TrendingUp} 
          color={COLORS.positive}
          trend={posRate}
          trendLabel="of total"
        />
        <MetricCard 
          title="Negative Sentiment" 
          value={negativeCount.toLocaleString()} 
          icon={TrendingDown}
          color={COLORS.negative}
          trend={negRate}
          trendLabel="of total"
        />
      </div>

      <div className="grid-2">
        {/* Sentiment Distribution */}
        <ChartCard title="Overall Sentiment Distribution">
          {sentimentData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                  stroke="none"
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase()] || COLORS.primary} />
                  ))}
                </Pie>
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Legend style={{ textTransform: 'capitalize' }} wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
             <EmptyState title="No Sentiment Data" description="Sentiment has not been analyzed for this dataset." />
          )}
        </ChartCard>

        {/* Activity By Time of Day */}
        <ChartCard title="Activity by Time of Day">
          {timeOfDayData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeOfDayData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="name" style={{ textTransform: 'capitalize' }} {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Bar dataKey="value" fill={COLORS.secondary} radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No Temporal Data" description="Timestamp column is not mapped." />
          )}
        </ChartCard>

        {/* Sentiment Trends */}
        <div style={{ gridColumn: '1 / -1' }}>
          <ChartCard title="Activity & Sentiment Trends Over Time">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.positive} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.positive} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.negative} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.negative} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_STYLES.grid} />
                  <XAxis dataKey="date" {...CHART_STYLES.axis} />
                  <YAxis {...CHART_STYLES.axis} />
                  <RechartsTooltip {...CHART_STYLES.tooltip} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  {data.sentiment?.sentiment_classes?.includes('positive') && (
                    <Area type="monotone" dataKey="positive" stroke={COLORS.positive} fillOpacity={1} fill="url(#colorPositive)" />
                  )}
                  {data.sentiment?.sentiment_classes?.includes('negative') && (
                    <Area type="monotone" dataKey="negative" stroke={COLORS.negative} fillOpacity={1} fill="url(#colorNegative)" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No Trend Data" description="Not enough temporal data to display trends." />
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
