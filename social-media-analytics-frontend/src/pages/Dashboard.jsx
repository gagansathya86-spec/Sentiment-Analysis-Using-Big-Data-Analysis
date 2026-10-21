import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, MessageSquare, Heart, TrendingUp, AlertTriangle, ShieldCheck, Database, 
  Layers, RefreshCw, ArrowRight, Zap, Sparkles, CheckCircle2 
} from 'lucide-react';
import { FbIcon } from '../components/BrandIcons';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
  Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';

import { 
  getUnifiedStatus, getUnifiedMetrics, getUnifiedCharts, 
  getAlerts, seedSampleData, clearSampleData, getHdfsStatus, getHdfsSummary, exportFacebookToHdfs
} from '../services/api';
import { DatasetContext } from '../context/DatasetContext';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import SectionHeader from '../components/ui/SectionHeader';
import SentimentBadge from '../components/ui/SentimentBadge';

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }
  }
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { datasetId, filename } = useContext(DatasetContext);
  
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [charts, setCharts] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [seeding, setSeeding] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [hdfsStatus, setHdfsStatus] = useState(null);
  const [hdfsSummary, setHdfsSummary] = useState(null);
  const [hdfsBusy, setHdfsBusy] = useState(false);
  const [hdfsMessage, setHdfsMessage] = useState('');

  const refreshHdfs = async () => {
    try {
      const statusResult = await getHdfsStatus();
      setHdfsStatus(statusResult.data);
      if (statusResult.data.available) {
        const summaryResult = await getHdfsSummary();
        setHdfsSummary(summaryResult.data);
      } else {
        setHdfsSummary(null);
      }
    } catch (err) {
      setHdfsMessage(err.response?.data?.detail?.message || 'HDFS storage status could not be checked.');
    }
  };

  const handleHdfsBackfill = async () => {
    setHdfsBusy(true);
    setHdfsMessage('');
    try {
      const result = await exportFacebookToHdfs(false);
      setHdfsMessage(`Verified ${result.data.files_written} HDFS files (${result.data.posts_exported} posts, ${result.data.comments_exported} comments) at ${result.data.hdfs_root}.`);
      await refreshHdfs();
    } catch (err) {
      setHdfsMessage(err.response?.data?.detail?.message || 'HDFS export failed. Existing SQLite data is preserved.');
    } finally {
      setHdfsBusy(false);
    }
  };

  const fetchOverview = async (isDemo = demoMode) => {
    setLoading(true);
    setLoadError('');
    try {
      const [statusRes, metricsRes, chartsRes, alertsRes] = await Promise.all([
        getUnifiedStatus(isDemo),
        getUnifiedMetrics('all', isDemo),
        getUnifiedCharts('all', isDemo),
        getAlerts('active', 'all')
      ]);
      setStatus(statusRes.data);
      setMetrics(metricsRes.data);
      setCharts(chartsRes.data);
      setRecentAlerts(alertsRes.data.alerts?.slice(0, 3) || []);
    } catch (err) {
      console.error(err);
      setLoadError('Facebook demonstration data could not be loaded.');
      setLoadError('Could not load the Facebook dashboard. Check the backend connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview(demoMode);
  }, [demoMode]);

  useEffect(() => { refreshHdfs(); }, []);

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      await seedSampleData();
      setDemoMode(true);
      await fetchOverview(true);
    } catch (err) {
      console.error(err);
      setLoadError('Facebook demonstration data could not be cleared.');
    } finally {
      setSeeding(false);
    }
  };

  const handleClearData = async () => {
    setSeeding(true);
    try {
      await clearSampleData();
      setDemoMode(false);
      await fetchOverview(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Social Intelligence Command Center" 
            subtitle="Big Data-based sentiment analysis, user behavior mining, and social intelligence for Facebook."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {demoMode || status?.has_sample_data ? (
            <button className="btn-secondary" onClick={handleClearData} disabled={seeding} style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
              Clear Demo Data
            </button>
          ) : (
            <button className="btn-secondary" onClick={handleSeedData} disabled={seeding}>
              <Sparkles size={15} /> 
              {seeding ? 'Loading Demo...' : 'Load Demo Data'}
            </button>
          )}
          <button className="btn-primary" onClick={() => navigate('/unified')}>
            Facebook Analytics <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {loadError && <div role="alert" style={{ color: 'var(--error)', marginBottom: '1rem' }}>{loadError}</div>}
      {loading && <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Loading Facebook analytics…</div>}

      <section aria-label="HDFS storage" style={{ margin: '0 0 1.5rem', padding: '1rem 1.2rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', background: 'var(--sidebar-bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Database size={21} color="var(--primary)" />
            <div>
              <strong style={{ color: 'var(--text-main)' }}>Hadoop HDFS storage</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>
                {hdfsStatus?.available ? `Connected · ${hdfsStatus.webhdfs_url} · root ${hdfsStatus.root_path}` : hdfsStatus?.message || 'Checking WebHDFS…'}
              </div>
              {hdfsSummary && <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                Read back {hdfsSummary.files_read} processed files · {hdfsSummary.posts} posts · {hdfsSummary.comments} comments · sentiment {Object.entries(hdfsSummary.sentiment_counts || {}).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}
              </div>}
              {hdfsMessage && <div role="status" style={{ color: hdfsMessage.toLowerCase().includes('failed') ? 'var(--error)' : 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{hdfsMessage}</div>}
            </div>
          </div>
          <button className="btn-secondary" onClick={handleHdfsBackfill} disabled={hdfsBusy || !hdfsStatus?.available} title="Backfill real Facebook records from SQLite to HDFS and verify writes">
            <Database size={15} /> {hdfsBusy ? 'Exporting…' : 'Backfill Facebook data'}
          </button>
        </div>
        {hdfsSummary?.files?.length > 0 && <details style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>
          <summary>Verified HDFS files ({hdfsSummary.files.length})</summary>
          <ul style={{ maxHeight: 130, overflow: 'auto', wordBreak: 'break-all' }}>{hdfsSummary.files.slice(0, 30).map((file) => <li key={file}>{file}</li>)}</ul>
        </details>}
      </section>

      {/* Demo Mode Notice Banner */}
      {(demoMode || status?.has_sample_data) && (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--warning)' }}>
            <Sparkles size={18} />
            <span style={{ fontSize: '0.85rem' }}>
              <strong>Demo Mode Active:</strong> Dashboard is currently displaying sample records for demonstration.
            </span>
          </div>
          <button onClick={handleClearData} className="btn-secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', borderColor: 'var(--warning)', color: 'var(--warning)' }}>
            Switch to Live Data
          </button>
        </div>
      )}

      {/* Active Alerts Banner if any */}
      {recentAlerts.length > 0 && (
        <div style={{ 
          padding: '1rem 1.25rem', 
          backgroundColor: 'rgba(239, 68, 68, 0.08)', 
          border: '1px solid var(--error)', 
          borderRadius: 'var(--radius)', 
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertTriangle size={20} color="var(--error)" />
            <div>
              <span style={{ fontWeight: 600, color: 'var(--error)' }}>
                {recentAlerts.length} Potential Negative Sentiment Increase(s) Need Review
              </span>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Latest: {recentAlerts[0]?.title}
              </div>
            </div>
          </div>
          <button 
            className="btn-secondary" 
            style={{ borderColor: 'var(--error)', color: 'var(--error)', fontSize: '0.8rem' }}
            onClick={() => navigate('/alerts')}
          >
            Review Incidents
          </button>
        </div>
      )}

      {/* Connection Status Overview */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Facebook Channel Card */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #1877f2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(24, 119, 242, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FbIcon size={22} color="#1877f2" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Facebook Integration (Active)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {status?.facebook?.posts_count || 0} Posts, {status?.facebook?.comments_count || 0} Comments Ingested
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span className={`badge ${status?.facebook?.configured ? 'badge-primary' : 'badge-neutral'}`} style={{ fontSize: '0.75rem' }}>
              {status?.facebook?.configured ? 'Live Active' : 'Offline'}
            </span>
            <div style={{ marginTop: '0.4rem' }}>
              <button 
                onClick={() => navigate('/facebook')} 
                style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              >
                Inspect Facebook <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard 
          title="Total Monitored" 
          value={metrics ? metrics.total_records.toLocaleString() : '0'} 
          icon={Layers} 
          subtitle="Facebook posts and comments" 
        />
        <MetricCard 
          title="Positive Perception" 
          value={metrics ? `${metrics.percentages.positive}%` : '0%'} 
          icon={TrendingUp} 
          subtitle={`${metrics?.sentiment_counts.positive || 0} positive items`} 
        />
        <MetricCard 
          title="Negative Feedback" 
          value={metrics ? `${metrics.percentages.negative}%` : '0%'} 
          icon={AlertTriangle} 
          subtitle={`${metrics?.sentiment_counts.negative || 0} negative items`} 
        />
        <MetricCard 
          title={metrics?.engagement.total_engagement_score != null ? 'Engagement Volume' : 'Observed Engagement Subtotal'} 
          value={metrics?.engagement.total_engagement_score != null ? metrics.engagement.total_engagement_score.toLocaleString() : (metrics?.engagement.observed_engagement_subtotal ?? 'Unavailable').toLocaleString()} 
          icon={Heart} 
          subtitle={metrics?.engagement.total_engagement_score != null ? 'Score = L + 2C + 3S' : `Likes + 2×comments; shares unavailable for ${metrics?.engagement.shares_unavailable_posts ?? 0} posts`} 
        />
      </div>

      {/* Charts Grid */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <ChartCard title="Overall Social Sentiment Share" subtitle="Classified via Scikit-Learn TF-IDF + Multinomial Naive Bayes">
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
              Load data or connect Meta account to visualize sentiment share.
            </div>
          )}
        </ChartCard>

        <ChartCard title="Facebook Post Engagement" subtitle="Post volume and average likes">
          {charts?.platform_comparison && charts.platform_comparison.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.platform_comparison} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="platform" {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Bar dataKey="posts" name="Posts" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg_likes" name="Avg Likes" fill="#ec4899" radius={[4, 4, 0, 0]} />
                <Legend verticalAlign="bottom" height={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No Facebook post records available.
            </div>
          )}
        </ChartCard>
      </div>

      {/* Fast Navigation Modules */}
      <h3 style={{ margin: '0 0 1rem 0' }}>Advanced Intelligence Modules</h3>
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <div className="card" onClick={() => navigate('/aspects')} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Sparkles size={20} color="var(--primary)" />
            <h4 style={{ margin: 0 }}>Aspect-Based Sentiment</h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Clause-level opinions for quality, price, service, delivery, location, and other configured topics.
          </p>
        </div>

        <div className="card" onClick={() => navigate('/viral-potential')} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Zap size={20} color="var(--warning)" />
            <h4 style={{ margin: 0 }}>Viral Potential Estimator</h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Experimental heuristic ranking using stored post reactions, comments, shares, and sentiment signals.
          </p>
        </div>

        <div className="card" onClick={() => navigate('/alerts')} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <AlertTriangle size={20} color="var(--error)" />
            <h4 style={{ margin: 0 }}>Crisis & Spike Alerts</h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Period-over-period Facebook sentiment changes with sample thresholds and supporting evidence.
          </p>
        </div>
        <div className="card" onClick={() => navigate('/trends')} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <TrendingUp size={20} color="var(--primary)" />
            <h4 style={{ margin: 0 }}>Facebook Trends</h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Compare sentiment over configurable stored-data windows and review timestamped emerging topics.
          </p>
        </div>
        <div className="card" onClick={() => navigate('/viral-potential')} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <CheckCircle2 size={20} color="var(--success)" />
            <h4 style={{ margin: 0 }}>Explainable Recommendations</h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Review actions tied to observed Facebook engagement and aspect-level feedback evidence.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
