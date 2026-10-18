import React, { useState, useEffect } from 'react';
import { 
  Sparkles, CheckCircle, AlertCircle, RefreshCw, Send,
  HelpCircle, ThumbsUp, ThumbsDown, Sliders, ChevronRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer 
} from 'recharts';

import { getAspectSummary, analyzeAspectText, getAspectConfig } from '../services/api';
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

const AspectAnalysis = () => {
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  
  // Sandbox State
  const [testText, setTestText] = useState(
    "The software performance is incredibly fast, but the monthly subscription price is way too expensive and customer support was rude."
  );
  const [sandboxResult, setSandboxResult] = useState(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  const fetchAspects = async () => {
    setLoading(true);
    try {
      const res = await getAspectSummary(platform);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAspects();
  }, [platform]);

  const handleRunSandbox = async (e) => {
    e.preventDefault();
    if (!testText.trim()) return;
    setSandboxLoading(true);
    try {
      const res = await analyzeAspectText(testText);
      setSandboxResult(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSandboxLoading(false);
    }
  };

  const chartData = data?.aspects ? data.aspects.map(a => ({
    name: a.name,
    Positive: a.positive_count,
    Negative: a.negative_count,
    Neutral: a.neutral_count,
    score: a.sentiment_score
  })) : [];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Aspect-Based Sentiment Analysis (ABSA)" 
            subtitle="Fine-grained opinion mining across key business dimensions: Product Quality, Pricing, Customer Service, Delivery, Usability, Reliability, and General Feedback."
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
          <button className="btn-secondary" onClick={fetchAspects} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Methodology Banner */}
      <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: 'rgba(79, 70, 229, 0.04)', borderColor: 'rgba(79, 70, 229, 0.2)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Sparkles size={20} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.875rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>NLP Segmentation Architecture: </span>
            {data?.methodology || 'Clause-level semantic segmentation with dictionary seed expansion and TF-IDF polarity classification.'}
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {data?.limitations}
            </div>
          </div>
        </div>
      </div>

      {/* Aspect Chart */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Sentiment Balance by Dimension</h3>
        <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Positive vs Negative sentiment frequency across tracked commercial aspects.
        </p>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
              <CartesianGrid {...CHART_STYLES.grid} />
              <XAxis dataKey="name" {...CHART_STYLES.axis} interval={0} angle={-15} textAnchor="end" />
              <YAxis {...CHART_STYLES.axis} />
              <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
              <Bar dataKey="Positive" fill="var(--success)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Negative" fill="var(--error)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Neutral" fill="var(--text-muted)" radius={[4, 4, 0, 0]} />
              <Legend verticalAlign="top" height={36} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={Sparkles} title="No Aspect Data" description="No aspect keywords matched in the social dataset yet." />
        )}
      </div>

      {/* Aspect Detail Cards */}
      <h3 style={{ marginBottom: '1rem' }}>Discovered Aspect Evidence Quotes</h3>
      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        {data?.aspects?.map((aspect) => (
          <div key={aspect.key} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>{aspect.name}</h4>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {aspect.total_mentions} total mentions
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge ${aspect.sentiment_score >= 0 ? 'badge-success' : 'badge-error'}`}>
                  Net Score: {aspect.sentiment_score > 0 ? `+${aspect.sentiment_score}` : aspect.sentiment_score}%
                </span>
              </div>
            </div>

            {/* Top Keywords */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {aspect.top_keywords?.map((kw, idx) => (
                <span key={idx} style={{ 
                  fontSize: '0.7rem', 
                  padding: '0.15rem 0.5rem', 
                  borderRadius: '10px', 
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-muted)'
                }}>
                  #{kw}
                </span>
              ))}
            </div>

            {/* Evidence Quotes */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {aspect.positive_evidence?.length > 0 && (
                <div style={{ padding: '0.6rem 0.75rem', backgroundColor: 'var(--success-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--success)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--success)', marginBottom: '0.2rem' }}>Positive Feedback:</div>
                  <div style={{ fontSize: '0.8rem', fontStyle: 'italic', lineHeight: 1.3 }}>"{aspect.positive_evidence[0].text}"</div>
                </div>
              )}

              {aspect.negative_evidence?.length > 0 && (
                <div style={{ padding: '0.6rem 0.75rem', backgroundColor: 'var(--error-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--error)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--error)', marginBottom: '0.2rem' }}>Negative Feedback:</div>
                  <div style={{ fontSize: '0.8rem', fontStyle: 'italic', lineHeight: 1.3 }}>"{aspect.negative_evidence[0].text}"</div>
                </div>
              )}

              {aspect.positive_evidence?.length === 0 && aspect.negative_evidence?.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  No direct quotes matched for this aspect filter.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Live Aspect Sandbox */}
      <div className="card">
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Interactive Aspect Classifier Sandbox</h3>
        <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Test the clause-level NLP model on multi-clause social feedback with mixed sentiment.
        </p>

        <form onSubmit={handleRunSandbox}>
          <textarea 
            rows={3} 
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.875rem' }}
            placeholder="Type comment (e.g. 'Delivery was late but product quality is superb')..."
          />
          <button type="submit" className="btn-primary" disabled={sandboxLoading}>
            <Send size={15} /> {sandboxLoading ? 'Analyzing Clauses...' : 'Analyze Aspect Clauses'}
          </button>
        </form>

        {sandboxResult && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>Clause Segmentation & Aspect Detection Results:</h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {Object.entries(sandboxResult.detected_aspects || {}).map(([aspName, details]) => (
                <div key={aspName} style={{ padding: '0.75rem', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize' }}>
                      {aspName.replace('_', ' ')}
                    </span>
                    <SentimentBadge sentiment={details.sentiment} />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Trigger keywords: {details.keywords?.join(', ')}
                  </div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.3rem', fontStyle: 'italic' }}>
                    Clause: "{details.evidence}"
                  </div>
                </div>
              ))}
            </div>

            {Object.keys(sandboxResult.detected_aspects || {}).length === 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No predefined aspect keywords detected in the clauses. Try mentioning 'quality', 'price', 'support', 'shipping', or 'delivery'.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AspectAnalysis;
