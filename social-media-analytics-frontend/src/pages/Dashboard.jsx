import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, MessageSquare, Heart, TrendingUp, AlertTriangle, ShieldCheck, 
  Layers, RefreshCw, ArrowRight, Zap, Sparkles, CheckCircle2 
} from 'lucide-react';
import { FbIcon, IgIcon } from '../components/BrandIcons';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
  Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';

import { 
  getUnifiedStatus, getUnifiedMetrics, getUnifiedCharts, 
  getAlerts, seedSampleData 
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
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [charts, setCharts] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [seeding, setSeeding] = useState(false);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const [statusRes, metricsRes, chartsRes, alertsRes] = await Promise.all([
        getUnifiedStatus(),
        getUnifiedMetrics('all'),
        getUnifiedCharts('all'),
        getAlerts('active', 'all')
      ]);
      setStatus(statusRes.data);
      setMetrics(metricsRes.data);
      setCharts(chartsRes.data);
      setRecentAlerts(alertsRes.data.alerts?.slice(0, 3) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      await seedSampleData();
      await fetchOverview();
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
            subtitle="Big Data-based sentiment analysis, user behavior mining, and cross-platform intelligence across Facebook and Instagram."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={handleSeedData} disabled={seeding}>
            <RefreshCw size={15} className={seeding ? 'animate-spin' : ''} /> 
            {seeding ? 'Loading Demo...' : 'Load Demo Data'}
          </button>
          <button className="btn-primary" onClick={() => navigate('/unified')}>
            Unified View <ArrowRight size={15} />
          </button>
        </div>
      </div>

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
                {recentAlerts.length} Active Negative Sentiment Incident(s) Detected
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
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Facebook Integration</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {status?.facebook?.posts_count || 0} Posts, {status?.facebook?.comments_count || 0} Comments Ingested
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span className={`badge ${status?.facebook?.configured ? 'badge-primary' : 'badge-neutral'}`} style={{ fontSize: '0.75rem' }}>
              {status?.facebook?.configured ? 'Configured' : 'Offline'}
            </span>
            <div style={{ marginTop: '0.4rem' }}>
              <button 
                onClick={() => navigate('/facebook')} 
                style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              >
                Inspect <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Instagram Channel Card */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #e1306c' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(225, 48, 108, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IgIcon size={22} color="#e1306c" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Instagram Professional</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {status?.instagram?.posts_count || 0} Posts, {status?.instagram?.comments_count || 0} Comments Ingested
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span className={`badge ${status?.instagram?.configured ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.75rem' }}>
              {status?.instagram?.configured ? 'Configured' : 'Offline'}
            </span>
            <div style={{ marginTop: '0.4rem' }}>
              <button 
                onClick={() => navigate('/instagram')} 
                style={{ fontSize: '0.75rem', color: '#e1306c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              >
                Inspect <ArrowRight size={12} />
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
          subtitle="Multi-platform items" 
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
          title="Engagement Volume" 
          value={metrics ? metrics.engagement.total_engagement_score.toLocaleString() : '0'} 
          icon={Heart} 
          subtitle={`Score = L + 2C + 3S`} 
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

        <ChartCard title="Platform Comparison Benchmark" subtitle="Activity volume by network">
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
              No comparison records available.
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
            Fine-grained sentiment across Quality, Pricing, Customer Support, Delivery, and Usability.
          </p>
        </div>

        <div className="card" onClick={() => navigate('/viral-potential')} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Zap size={20} color="var(--warning)" />
            <h4 style={{ margin: 0 }}>Viral Potential Estimator</h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Multi-factor scoring algorithm ranking posts by comment velocity, timing, and emotional resonance.
          </p>
        </div>

        <div className="card" onClick={() => navigate('/alerts')} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <AlertTriangle size={20} color="var(--error)" />
            <h4 style={{ margin: 0 }}>Crisis & Spike Alerts</h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Automated monitoring detecting sudden surges in negative customer feedback.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
