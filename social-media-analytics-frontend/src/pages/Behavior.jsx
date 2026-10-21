import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, Share2, Clock } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import { getFacebookDashboardAnalytics, getApiErrorMessage } from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { usePlatform } from '../context/PlatformContext';

const PERIODS = ['morning', 'afternoon', 'evening', 'night'];
const COLORS = ['var(--primary)', '#8b5cf6', '#f59e0b', 'var(--success)'];

const formatCount = (value) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toLocaleString() : '—'
);

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' },
    itemStyle: { color: 'var(--text-main)' }
  }
};

const Behavior = () => {
  const { platform } = usePlatform();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFacebookDashboardAnalytics(platform)
      .then(({ data: analytics }) => {
        if (!cancelled) {
          setData(analytics || null);
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setData(null);
          setError(getApiErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [platform]);

  if (loading) return <PageSkeleton type="dashboard" />;

  const behavior = data?.behavior || {};
  const pageScope = data?.account_id ? `the selected ${platform === 'instagram' ? 'Instagram account' : 'Facebook page'}` : `all stored ${platform === 'instagram' ? 'Instagram accounts' : 'Facebook pages'}`;
  const engagement = behavior.engagement || {};
  const engagementData = [
    { name: 'Likes', metric: engagement.likes, fill: '#ef4444' },
    { name: 'Comments', metric: engagement.comments, fill: '#3b82f6' },
    { name: 'Shares', metric: engagement.shares, fill: '#10b981' },
  ].map(({ name, metric, fill }) => {
    const available = metric?.available === true && typeof metric.total === 'number' && Number.isFinite(metric.total);
    return {
      name,
      value: available ? metric.total : null,
      displayValue: available ? formatCount(metric.total) : 'Unavailable',
      available,
      observedPosts: metric?.observed_posts,
      totalPosts: metric?.total_posts,
      fill,
    };
  });
  const engagementAvailable = engagementData.some((item) => item.available);
  const activityByPeriod = behavior.activity_by_period || {};
  const activityData = PERIODS.map((name, index) => ({
    name: name[0].toUpperCase() + name.slice(1),
    value: typeof activityByPeriod[name] === 'number' && Number.isFinite(activityByPeriod[name])
      ? activityByPeriod[name]
      : null,
    fill: COLORS[index % COLORS.length],
  }));
  const activityAvailable = behavior.activity_available === true
    && activityData.some((item) => item.value !== null)
    && Number(behavior.timestamped_activity_records) > 0;

  return (
    <div>
      <SectionHeader 
        title="User Behavior" 
        subtitle={`Engagement totals and timestamped activity from ${pageScope}.`}
      />

      {error && <p role="alert" style={{ color: 'var(--error)' }}>Facebook analytics could not be loaded ({error}).</p>}

      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <MetricCard 
          title="Total Likes" 
          value={engagementData[0].displayValue}
          icon={Heart} 
          color="#ef4444"
          subtitle={engagementData[0].available ? `Observed on ${formatCount(engagementData[0].observedPosts)} of ${formatCount(engagementData[0].totalPosts)} posts` : 'Not supplied for these posts'}
        />
        <MetricCard 
          title="Total Comments" 
          value={engagementData[1].displayValue}
          icon={MessageCircle} 
          color="#3b82f6"
          subtitle={engagementData[1].available ? `Observed on ${formatCount(engagementData[1].observedPosts)} of ${formatCount(engagementData[1].totalPosts)} posts` : 'Not supplied for these posts'}
        />
        <MetricCard 
          title="Total Shares" 
          value={engagementData[2].displayValue}
          icon={Share2} 
          color="#10b981"
          subtitle={engagementData[2].available ? `Observed on ${formatCount(engagementData[2].observedPosts)} of ${formatCount(engagementData[2].totalPosts)} posts` : 'Not supplied for these posts'}
        />
      </div>

      <div className="grid-2">
        <ChartCard title="Activity by Time of Day">
          {activityAvailable ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Timestamped Facebook posts and comments by UTC period ({formatCount(behavior.timestamped_activity_records)} records)
              </p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={activityData} margin={{ top: 22, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid {...CHART_STYLES.grid} />
                  <XAxis dataKey="name" {...CHART_STYLES.axis} />
                  <YAxis {...CHART_STYLES.axis} allowDecimals={false} />
                  <RechartsTooltip {...CHART_STYLES.tooltip} formatter={(value) => [`${formatCount(value)} records`, 'Activity']} />
                  <Bar dataKey="value" name="Records" radius={[4, 4, 0, 0]}>
                    {activityData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                    <LabelList dataKey="value" position="top" formatter={formatCount} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={Clock} title="No Temporal Data" description={error ? `Could not retrieve Facebook activity: ${error}` : 'No valid timestamps are available for the selected Facebook page.'} />
          )}
        </ChartCard>

        <ChartCard title="Engagement Distribution">
          {engagementAvailable ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagementData} margin={{ top: 24, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="name" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} allowDecimals={false} />
                <RechartsTooltip {...CHART_STYLES.tooltip} formatter={(value, name, item) => [item?.payload?.displayValue || formatCount(value), name]} />
                <Bar dataKey="value" name="Total" radius={[4, 4, 0, 0]} barSize={50}>
                  {engagementData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  <LabelList dataKey="displayValue" position="top" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No Engagement Data" description={error ? `Could not retrieve Facebook engagement: ${error}` : 'Likes, comments, and shares are unavailable for these Facebook posts.'} />
          )}
        </ChartCard>
      </div>
    </div>
  );
};
export default Behavior;
