import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Hash, RefreshCw, ArrowUpRight, Layers
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer 
} from 'recharts';

import { getTrendDiscovery } from '../services/api';
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

export const Trends = () => {
  const { platform, setPlatform } = usePlatform();
  const [periodDays, setPeriodDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [trends, setTrends] = useState(null);
  const [keywordSearch, setKeywordSearch] = useState('');

  const fetchTrends = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await getTrendDiscovery(platform, 25, periodDays);
      setTrends(res.data);
    } catch (err) {
      console.error(err);
      setLoadError('Could not load platform trends. Check the backend connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, [platform, periodDays]);

  const filteredKeywords = trends?.top_keywords?.filter(k => 
    k.keyword.toLowerCase().includes(keywordSearch.toLowerCase())
  ) || [];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Keyword & Trend Discovery" 
            subtitle={`${platform === 'instagram' ? 'Instagram' : 'Facebook'} topic frequency, sentiment over time, hashtag discovery, and timestamp-based emerging topics.`}
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
            <option value="instagram">Instagram Only</option>
          </select>
          <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))} style={{ fontSize: '0.85rem' }} aria-label="Trend comparison period">
            <option value={7}>7-day comparison</option>
            <option value={14}>14-day comparison</option>
            <option value={30}>30-day comparison</option>
          </select>
          <button className="btn-secondary" onClick={fetchTrends} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {loadError && <div role="alert" style={{ color: 'var(--error)', marginBottom: '1rem' }}>{loadError}</div>}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.35rem' }}>Sentiment period comparison</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
          Consecutive windows ending at the latest timestamp in stored {platform === 'instagram' ? 'Instagram' : 'Facebook'} data. This is a data-relative comparison, not a claim about today.
        </p>
        {trends?.period_comparison?.available ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <span>Current negative: <strong>{trends.period_comparison.current_period.negative_percent}%</strong> ({trends.period_comparison.current_period.total} items)</span>
              <span>Previous negative: <strong>{trends.period_comparison.previous_period.negative_percent}%</strong> ({trends.period_comparison.previous_period.total} items)</span>
              <span>Change: <strong>{trends.period_comparison.negative_change_percentage_points > 0 ? '+' : ''}{trends.period_comparison.negative_change_percentage_points} percentage points</strong></span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trends.sentiment_over_time}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="date" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Legend />
                <Bar dataKey="positive" stackId="sentiment" fill="var(--success)" />
                <Bar dataKey="negative" stackId="sentiment" fill="var(--error)" />
                <Bar dataKey="neutral" stackId="sentiment" fill="var(--text-muted)" />
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{trends?.period_comparison?.reason || 'Loading period comparison…'}</div>}
      </div>

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard 
          title="Discovered Keywords" 
          value={trends?.top_keywords?.length || 0} 
          icon={TrendingUp} 
          subtitle="Meaningful terms" 
        />
        <MetricCard 
          title="Top Hashtags" 
          value={trends?.top_hashtags?.length || 0} 
          icon={Hash} 
          subtitle="Indexed tags" 
        />
        <MetricCard 
          title="Emerging Topics" 
          value={trends?.emerging_topics?.length || 0} 
          icon={ArrowUpRight} 
          subtitle="Accelerating velocity" 
        />
        <MetricCard 
          title="Ingested Text Items" 
          value={trends?.total_items || 0} 
          icon={Layers} 
          subtitle="Posts & comments" 
        />
      </div>

      {/* Charts Grid: Top Positive vs Negative Keywords */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <ChartCard title="Prominent Positive Keywords" subtitle="Terms most correlated with positive sentiment">
          {trends?.positive_keywords && trends.positive_keywords.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trends.positive_keywords.slice(0, 8)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="keyword" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Bar dataKey="count" name="Positive Mentions" fill="var(--success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No positive keywords detected.
            </div>
          )}
        </ChartCard>

        <ChartCard title="Prominent Negative Keywords" subtitle="Terms most correlated with consumer complaints">
          {trends?.negative_keywords && trends.negative_keywords.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trends.negative_keywords.slice(0, 8)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="keyword" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Bar dataKey="count" name="Negative Mentions" fill="var(--error)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No negative keywords detected.
            </div>
          )}
        </ChartCard>
      </div>

      {/* Emerging Topics & Hashtags */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Accelerating & Emerging Topics</h3>
          <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Repeated keyword occurrences compared across consecutive seven-day UTC windows.
          </p>

          {trends?.emerging_topics && trends.emerging_topics.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {trends.emerging_topics.map((item, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '0.6rem 0.75rem',
                  backgroundColor: 'var(--bg-color)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ArrowUpRight size={16} color="var(--primary)" />
                    <span style={{ fontWeight: 600 }}>{item.keyword}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {item.recent_count} recent mentions
                    </span>
                    <span className="badge badge-primary">
                      {item.growth_velocity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {trends?.emerging_topics_reason || 'Emerging-topic velocity is unavailable without sufficient timestamped records in both windows.'}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Hashtag Discovery Cloud</h3>
          <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Hashtags detected across stored {platform === 'instagram' ? 'Instagram' : 'Facebook'} posts.
          </p>

          {trends?.top_hashtags && trends.top_hashtags.length > 0 ? (
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', padding: '0.5rem 0' }}>
              {trends.top_hashtags.map((h, idx) => (
                <span key={idx} style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(79, 70, 229, 0.1)',
                  border: '1px solid rgba(79, 70, 229, 0.3)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}>
                  <strong style={{ color: 'var(--primary)' }}>{h.hashtag}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({h.count})</span>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No hashtags present in current post text.
            </div>
          )}
        </div>
      </div>

      {/* Selected platform keyword summary */}
      {trends?.platform_comparison && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0' }}>{platform === 'instagram' ? 'Instagram' : 'Facebook'} Keyword Fingerprints</h3>
          <div>
            <div>
              <div style={{ fontWeight: 600, color: '#1877f2', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                {platform === 'instagram' ? 'Instagram' : 'Facebook'} Frequent Keywords:
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {trends.platform_comparison[`${platform}_top_keywords`]?.map((k, i) => (
                  <span key={i} className="badge badge-neutral" style={{ padding: '0.3rem 0.6rem' }}>
                    {k.keyword} ({k.count})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Keyword Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Keyword-to-Sentiment Distribution</h3>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Top 25 extracted keywords with individual positive, negative, and neutral breakdown.
            </p>
          </div>

          <input 
            type="text" 
            placeholder="Filter keywords..." 
            value={keywordSearch}
            onChange={(e) => setKeywordSearch(e.target.value)}
            style={{ fontSize: '0.8rem', width: '200px' }}
          />
        </div>

        {filteredKeywords.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No Keywords Match" description="Try a different search query." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Keyword</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Total Frequency</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Positive</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Negative</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Neutral</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Dominant Polarity</th>
                </tr>
              </thead>
              <tbody>
                {filteredKeywords.map((k) => (
                  <tr key={k.keyword} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{k.keyword}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{k.count}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--success)' }}>{k.positive}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--error)' }}>{k.negative}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{k.neutral}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <SentimentBadge sentiment={k.dominant_sentiment} />
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

export default Trends;
