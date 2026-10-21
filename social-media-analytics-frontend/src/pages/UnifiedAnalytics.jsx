import React, { useState, useEffect } from 'react';
import { 
  Layers, Download, RefreshCw, Search, MessageSquare, 
  Filter, BarChart2, TrendingUp, Users, Heart, Share2, MessageCircle, AlertTriangle
} from 'lucide-react';
import { FbIcon } from '../components/BrandIcons';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area 
} from 'recharts';

import { 
  getUnifiedMetrics, getUnifiedCharts, getUnifiedFeed, 
  seedSampleData, clearSampleData, downloadExportCsv 
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

const formatMetric = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
);
const formatPercent = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '—'
);

const UnifiedAnalytics = () => {
  const { platform, setPlatform } = usePlatform();
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [charts, setCharts] = useState(null);
  const [feed, setFeed] = useState([]);
  const [seeding, setSeeding] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const fetchData = async (isDemo = demoMode) => {
    setLoading(true);
    try {
      const [metricsRes, chartsRes, feedRes] = await Promise.all([
        getUnifiedMetrics(platform, isDemo),
        getUnifiedCharts(platform, isDemo),
        getUnifiedFeed({ platform, sentiment: sentimentFilter, search: searchQuery, limit: 50, demo_mode: isDemo })
      ]);
      setMetrics(metricsRes.data);
      setCharts(chartsRes.data);
      setFeed(feedRes.data.data || []);
      if (feedRes.data.is_sample_feed) {
        setDemoMode(true);
      }
    } catch (err) {
      console.error('Error fetching unified analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(demoMode);
  }, [platform, sentimentFilter, demoMode]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchData(demoMode);
  };

  const handleSeedDemoData = async () => {
    setSeeding(true);
    try {
      await seedSampleData();
      setDemoMode(true);
      await fetchData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSeeding(false);
    }
  };

  const handleClearDemoData = async () => {
    setSeeding(true);
    try {
      await clearSampleData();
      setDemoMode(false);
      await fetchData(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header & Global Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title={`${platform === 'instagram' ? 'Instagram' : 'Facebook'} Social Intelligence`} 
            subtitle={`${platform === 'instagram' ? 'Instagram' : 'Facebook'} analytics synthesizing sentiment, engagement, and customer perception into a normalized view.`}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Platform Toggle */}
          <div style={{ 
            display: 'flex', 
            backgroundColor: 'var(--card-bg)', 
            border: '1px solid var(--border-color)', 
            borderRadius: 'var(--radius-sm)',
            padding: '2px'
          }}>
            {[
              { id: 'facebook', label: 'Facebook' },
              { id: 'instagram', label: 'Instagram' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPlatform(tab.id)}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: platform === tab.id ? 'var(--primary)' : 'transparent',
                  color: platform === tab.id ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button onClick={() => downloadExportCsv(platform).catch((error) => console.error('CSV export failed', error))} className="btn-secondary">
            <Download size={15} /> Export CSV
          </button>

          {demoMode ? (
            <button className="btn-secondary" onClick={handleClearDemoData} disabled={seeding} style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
              Clear Demo Data
            </button>
          ) : (
            <button className="btn-secondary" onClick={handleSeedDemoData} disabled={seeding}>
              <RefreshCw size={15} className={seeding ? 'animate-spin' : ''} /> 
              {seeding ? 'Loading...' : 'Load Sample Demo'}
            </button>
          )}
        </div>
      </div>


      {/* Demo Mode Notice Banner */}
      {demoMode && (
        <div style={{ 
          padding: '0.75rem 1.25rem', 
          backgroundColor: 'rgba(234, 179, 8, 0.1)', 
          border: '1px solid rgba(234, 179, 8, 0.3)', 
          borderRadius: 'var(--radius)', 
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--warning)' }}>
            <strong>Demo Mode:</strong> Displaying synthetic records for demonstration.
          </span>
          <button onClick={handleClearDemoData} className="btn-secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderColor: 'var(--warning)', color: 'var(--warning)' }}>
            Switch to Live Data
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard 
          title="Total Ingested Records" 
          value={formatMetric(metrics?.total_records)} 
          icon={Layers} 
          subtitle={`${formatMetric(metrics?.total_posts)} Posts, ${formatMetric(metrics?.total_comments)} Comments`} 
        />
        <MetricCard 
          title="Positive Sentiment" 
          value={formatPercent(metrics?.percentages?.positive)} 
          icon={TrendingUp} 
          subtitle={`${formatMetric(metrics?.sentiment_counts?.positive)} positive items`} 
        />
        <MetricCard 
          title="Negative Sentiment" 
          value={formatPercent(metrics?.percentages?.negative)} 
          icon={AlertTriangle} 
          subtitle={`${formatMetric(metrics?.sentiment_counts?.negative)} negative items`} 
        />
        <MetricCard 
          title="Total Engagement Score" 
          value={formatMetric(metrics?.engagement?.total_engagement_score)} 
          icon={Heart} 
          subtitle={`Avg ${formatMetric(metrics?.engagement?.average_engagement_per_post)} per post`} 
        />
      </div>

      {/* Charts Grid */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <ChartCard title="Facebook Sentiment Distribution" subtitle="Sentiment across stored Facebook posts">
          {charts?.sentiment_distribution && charts.sentiment_distribution.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie 
                  data={charts.sentiment_distribution} 
                  dataKey="value" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={55} 
                  outerRadius={85} 
                  paddingAngle={4}
                >
                  {charts.sentiment_distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No sentiment records available for this filter.
            </div>
          )}
        </ChartCard>

        <ChartCard title="Sentiment Timeline" subtitle="Positive vs Negative posts over time">
          {charts?.timeline && charts.timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={charts.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--error)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--error)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="date" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Area type="monotone" dataKey="positive" stroke="var(--success)" fillOpacity={1} fill="url(#colorPos)" name="Positive" />
                <Area type="monotone" dataKey="negative" stroke="var(--error)" fillOpacity={1} fill="url(#colorNeg)" name="Negative" />
                <Legend verticalAlign="bottom" height={36} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Timeline data requires timestamped records.
            </div>
          )}
        </ChartCard>
      </div>

      {/* Platform Comparison Matrix */}
      {charts?.platform_comparison && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0' }}>Facebook Post Metrics</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Platform</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Posts Tracked</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Avg Likes</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Avg Comments</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Positive %</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Negative %</th>
                </tr>
              </thead>
              <tbody>
                {charts.platform_comparison.map((row) => (
                  <tr key={row.platform} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                      <FbIcon size={18} color="#1877f2" />
                      {row.platform}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{row.posts}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{row.avg_likes}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{row.avg_comments}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--success)' }}>{row.positive_pct}%</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--error)' }}>{row.negative_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unified Feed Table with Controls */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Facebook Feed</h3>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Normalized social records with sentiment predictions and interaction metrics.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {/* Sentiment Filter */}
            <select 
              value={sentimentFilter} 
              onChange={(e) => setSentimentFilter(e.target.value)}
              style={{ fontSize: '0.8rem' }}
            >
              <option value="all">All Sentiments</option>
              <option value="positive">Positive Only</option>
              <option value="negative">Negative Only</option>
              <option value="neutral">Neutral Only</option>
            </select>

            {/* Keyword Search */}
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                placeholder="Search text..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: '0.8rem', width: '180px' }}
              />
              <button type="submit" className="btn-secondary" style={{ padding: '0.4rem 0.75rem' }}>
                <Search size={14} />
              </button>
            </form>
          </div>
        </div>

        {feed.length === 0 ? (
          <EmptyState 
            icon={Layers}
            title="No Feed Records Found"
            description="Try adjusting your filters or load the Facebook sample demo."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Platform</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Content</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Sentiment</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Engagement</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((post) => (
                  <tr key={post.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textTransform: 'capitalize' }}>
                        <FbIcon size={12} />
                        {post.platform}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '450px' }}>
                      <div style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>
                        {post.text || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No text</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Author: {post.author || 'Author'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <SentimentBadge sentiment={post.sentiment || 'neutral'} />
                      {post.sentiment_confidence > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {Math.round(post.sentiment_confidence * 100)}% conf
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span title="Likes" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Heart size={13} color="var(--error)" /> {post.likes_count ?? 0}
                        </span>
                        <span title="Comments" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <MessageCircle size={13} color="var(--primary)" /> {post.comments_count ?? 0}
                        </span>
                        {post.platform === 'facebook' && (
                          <span title="Shares" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Share2 size={13} color="#f59e0b" /> {post.shares_count ?? 0}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {post.created_time ? new Date(post.created_time).toLocaleDateString() : 'N/A'}
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

export default UnifiedAnalytics;
