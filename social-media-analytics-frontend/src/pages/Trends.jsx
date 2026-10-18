import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Hash, MessageSquare, RefreshCw, 
  Search, ArrowUpRight, BarChart2, Layers 
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

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }
  }
};

export const Trends = () => {
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [trends, setTrends] = useState(null);
  const [keywordSearch, setKeywordSearch] = useState('');

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const res = await getTrendDiscovery(platform, 25);
      setTrends(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, [platform]);

  const filteredKeywords = trends?.top_keywords?.filter(k => 
    k.keyword.toLowerCase().includes(keywordSearch.toLowerCase())
  ) || [];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Keyword & Trend Discovery" 
            subtitle="Topic frequency mining, polarity association, hashtag discovery, and emerging conversational velocity across channels."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select 
            value={platform} 
            onChange={(e) => setPlatform(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          >
            <option value="all">All Sources</option>
            <option value="facebook">Facebook Only</option>
            <option value="instagram">Instagram Only</option>
          </select>
          <button className="btn-secondary" onClick={fetchTrends} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
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
            Terms exhibiting highest growth velocity comparing second half to first half of dataset.
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
              Requires larger chronological dataset to calculate acceleration velocity.
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Hashtag Discovery Cloud</h3>
          <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Categorical hashtags detected across Instagram and Facebook posts.
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

      {/* Cross-Platform Comparison Table */}
      {platform === 'all' && trends?.platform_comparison && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0' }}>Cross-Platform Keyword Fingerprints</h3>
          <div className="grid-2">
            <div>
              <div style={{ fontWeight: 600, color: '#1877f2', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Facebook Distinctive Keywords:
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {trends.platform_comparison.facebook_top_keywords?.map((k, i) => (
                  <span key={i} className="badge badge-neutral" style={{ padding: '0.3rem 0.6rem' }}>
                    {k.keyword} ({k.count})
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, color: '#e1306c', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Instagram Distinctive Keywords:
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {trends.platform_comparison.instagram_top_keywords?.map((k, i) => (
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
