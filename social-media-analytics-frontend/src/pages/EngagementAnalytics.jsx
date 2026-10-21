import React, { useState, useEffect } from 'react';
import { 
  Heart, MessageCircle, Share2, TrendingUp, Clock, 
  Calendar, Award, Info, RefreshCw, BarChart2, CheckCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, LineChart, Line 
} from 'recharts';

import { 
  getEngagementOverview, getEngagementCorrelation, getBestPostingTimes 
} from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import SentimentBadge from '../components/ui/SentimentBadge';
import SectionHeader from '../components/ui/SectionHeader';
import EmptyState from '../components/ui/EmptyState';
import { usePlatform } from '../context/PlatformContext';

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }
  }
};

const EngagementAnalytics = () => {
  const { platform, setPlatform } = usePlatform();
  const [loading, setLoading] = useState(true);
  
  const [overview, setOverview] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [postingTimes, setPostingTimes] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [overRes, corrRes, timesRes] = await Promise.all([
        getEngagementOverview(platform),
        getEngagementCorrelation(platform),
        getBestPostingTimes(platform)
      ]);
      setOverview(overRes.data);
      setCorrelation(corrRes.data);
      setPostingTimes(timesRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [platform]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Engagement Dynamics & Behavior Analytics" 
            subtitle="Interaction velocity metrics, sentiment-to-engagement correlations, and data-driven optimal posting windows."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select 
            value={platform} 
            onChange={(e) => setPlatform(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          >
            <option value="facebook">Facebook Only</option>
            <option value="instagram">Instagram Only</option>
          </select>
          <button className="btn-secondary" onClick={fetchData} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Formula Explainer */}
      <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Info size={18} color="var(--primary)" />
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Standard Engagement Formula: </span>
            <code>Engagement Score = Likes + (2 * Comments) + (3 * Shares)</code>. 
            Because comments and shares reflect higher consumer commitment, comments receive double weighting and shares receive triple weighting.
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard 
          title={overview?.engagement_score_complete ? 'Total Engagement' : 'Observed Engagement Subtotal'} 
          value={overview?.engagement_score_complete ? overview.total_engagement_score.toLocaleString() : (overview?.observed_engagement_subtotal ?? 'Unavailable').toLocaleString()} 
          icon={TrendingUp} 
          subtitle={overview?.engagement_score_complete ? 'Likes + 2×comments + 3×shares' : `Known subtotal; shares unavailable for ${overview?.shares_unavailable_posts ?? 0} posts`} 
        />
        <MetricCard 
          title={overview?.engagement_score_complete ? 'Average per Post' : 'Observed Average per Post'} 
          value={overview?.average_engagement_per_post ?? overview?.average_observed_engagement_per_post ?? 'Unavailable'} 
          icon={Award} 
          subtitle={overview?.engagement_score_complete ? 'Complete formula score per post' : 'Observed subtotal per post; shares are unavailable'} 
        />
        <MetricCard 
          title="Total Likes" 
          value={overview?.total_likes != null ? overview.total_likes.toLocaleString() : 'Unavailable'} 
          icon={Heart} 
          subtitle="Reaction base" 
        />
        <MetricCard 
          title="Total Comments" 
          value={overview?.total_comments != null ? overview.total_comments.toLocaleString() : 'Unavailable'} 
          icon={MessageCircle} 
          subtitle="Direct replies" 
        />
      </div>

      {/* Charts: Correlation + Timing */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <ChartCard title="Engagement vs Sentiment Correlation" subtitle="Observed subtotal by sentiment; complete formula averages remain unavailable when shares are missing">
          {correlation?.data && correlation.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={correlation.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="sentiment" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Bar dataKey="avg_observed_subtotal" name="Avg Observed Subtotal" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg_comments" name="Avg Comments" fill="#ec4899" radius={[4, 4, 0, 0]} />
                <Legend verticalAlign="bottom" height={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No correlation data available.
            </div>
          )}
        </ChartCard>

        <ChartCard title="Hourly Activity & Engagement Peak" subtitle="Average engagement score across hours of the day (UTC)">
          {postingTimes?.hourly_distribution ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={postingTimes.hourly_distribution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="hour" {...CHART_STYLES.axis} interval={3} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Line type="monotone" dataKey="avg_engagement" stroke="var(--primary)" strokeWidth={2} name="Avg Engagement" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No timestamped data available.
            </div>
          )}
        </ChartCard>
      </div>

      {/* Recommended Windows */}
      {postingTimes?.recommended_peak_hours && (
        <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Clock size={20} color="var(--primary)" />
          <div>
            <span style={{ fontWeight: 600 }}>Empirical Best Posting Hours (UTC): </span>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              {postingTimes.recommended_peak_hours.join(' , ')}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.75rem' }}>
              (Based on historical response velocity across monitored feeds)
            </span>
          </div>
        </div>
      )}

      {/* Top Performing Posts Table */}
      <div className="card">
        <h3 style={{ margin: '0 0 1rem 0' }}>Top Performing Content Ranked by Engagement</h3>
        
        {!overview?.top_posts || overview.top_posts.length === 0 ? (
          <EmptyState icon={Award} title="No Content Ranked" description="Ingest or analyze posts to compute engagement rankings." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Rank</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Platform</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Post Text</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Sentiment</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Likes</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Comments</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Engagement Score</th>
                </tr>
              </thead>
              <tbody>
                {overview.top_posts.map((post, idx) => (
                  <tr key={post.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: idx < 3 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      #{idx + 1}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>
                      {post.platform}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '380px', lineHeight: 1.4 }}>
                      {post.text}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <SentimentBadge sentiment={post.sentiment || 'neutral'} />
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{post.likes}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{post.comments}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--primary)' }}>
                      {post.engagement_score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EngagementAnalytics;
