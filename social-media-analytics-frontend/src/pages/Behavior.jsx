import React, { useEffect, useState, useContext } from 'react';
import { Heart, MessageCircle, Share2, Clock } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { DatasetContext } from '../context/DatasetContext';
import { getBehaviorSummary } from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';

const COLORS = ['var(--primary)', '#8b5cf6', '#f59e0b', 'var(--success)'];

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' },
    itemStyle: { color: 'var(--text-main)' }
  }
};

const Behavior = () => {
  const { datasetId } = useContext(DatasetContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (datasetId) {
      getBehaviorSummary(datasetId).then(res => {
        setData(res.data);
        setLoading(false);
      });
    }
  }, [datasetId]);

  if (loading) return <PageSkeleton type="dashboard" />;
  if (!data) return null;

  const timeOfDayData = data.activity_by_time_of_day?.activity_by_period 
    ? Object.entries(data.activity_by_time_of_day.activity_by_period).map(([name, value]) => ({ name, value }))
    : [];

  const engagementAvailable = data.engagement?.available;

  return (
    <div>
      <SectionHeader 
        title="User Behavior" 
        subtitle="Analyze audience engagement metrics and peak activity times."
      />

      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <MetricCard 
          title="Total Likes" 
          value={engagementAvailable ? data.engagement.metrics?.likes?.total.toLocaleString() : 'N/A'} 
          icon={Heart} 
          color="#ef4444"
        />
        <MetricCard 
          title="Total Comments" 
          value={engagementAvailable ? data.engagement.metrics?.comments?.total.toLocaleString() : 'N/A'} 
          icon={MessageCircle} 
          color="#3b82f6"
        />
        <MetricCard 
          title="Total Shares" 
          value={engagementAvailable ? data.engagement.metrics?.shares?.total.toLocaleString() : 'N/A'} 
          icon={Share2} 
          color="#10b981"
        />
      </div>

      <div className="grid-2">
        <ChartCard title="Activity Periods">
          {timeOfDayData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={timeOfDayData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="value" label stroke="none">
                  {timeOfDayData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Legend style={{ textTransform: 'capitalize' }} wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={Clock} title="No Temporal Data" description="Timestamp column is not mapped in this dataset." />
          )}
        </ChartCard>

        <ChartCard title="Engagement Distribution">
          {engagementAvailable ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Likes', value: data.engagement.metrics?.likes?.total || 0, fill: '#ef4444' },
                { name: 'Comments', value: data.engagement.metrics?.comments?.total || 0, fill: '#3b82f6' },
                { name: 'Shares', value: data.engagement.metrics?.shares?.total || 0, fill: '#10b981' }
              ]} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="name" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip {...CHART_STYLES.tooltip} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={50}>
                  {
                    [
                      { name: 'Likes', value: data.engagement.metrics?.likes?.total || 0, fill: '#ef4444' },
                      { name: 'Comments', value: data.engagement.metrics?.comments?.total || 0, fill: '#3b82f6' },
                      { name: 'Shares', value: data.engagement.metrics?.shares?.total || 0, fill: '#10b981' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))
                  }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No Engagement Data" description="Engagement columns (likes, shares, etc.) are not mapped." />
          )}
        </ChartCard>
      </div>
    </div>
  );
};
export default Behavior;
