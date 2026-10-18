import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  RefreshCw, Loader2, Database, MessageSquare, 
  ThumbsUp, ExternalLink, AlertCircle, CheckCircle, Info, Heart, MessageCircle
} from 'lucide-react';
import { IgIcon } from '../components/BrandIcons';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend 
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

import { 
  getInstagramStatus, getInstagramMedia, analyzeInstagramMedia, 
  getInstagramComments, analyzeInstagramComments, importInstagramAsDataset 
} from '../services/api';
import { DatasetContext } from '../context/DatasetContext';
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

const Instagram = () => {
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusData, setStatusData] = useState(null);
  
  const [mediaLoading, setMediaLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [mediaList, setMediaList] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);
  
  const [selectedPost, setSelectedPost] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postComments, setPostComments] = useState([]);
  
  const [importing, setImporting] = useState(false);
  const { setDatasetId, setFilename, setColumnMapping } = useContext(DatasetContext);
  const navigate = useNavigate();

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await getInstagramStatus();
      setStatusData(res.data);
    } catch (err) {
      setStatusData({ connected: false, message: err.response?.data?.detail || err.message });
    } finally {
      setStatusLoading(false);
    }
  };

  const loadMedia = async () => {
    setMediaLoading(true);
    setError(null);
    try {
      const res = await getInstagramMedia(true);
      setMediaList(res.data.data || []);
      if (res.data.api_error) {
        setError(`Notice: ${res.data.api_error}`);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch Instagram media');
    } finally {
      setMediaLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await analyzeInstagramMedia();
      setAnalysisResult(res.data);
      if (res.data.analyzed_posts) {
        setMediaList(res.data.analyzed_posts);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to analyze Instagram posts');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleViewComments = async (post) => {
    setSelectedPost(post);
    setCommentsLoading(true);
    try {
      const res = await analyzeInstagramComments(post.id);
      setPostComments(res.data.analyzed_comments || []);
    } catch (err) {
      try {
        const fallback = await getInstagramComments(post.id);
        setPostComments(fallback.data || []);
      } catch (e) {
        setPostComments([]);
      }
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleImportDataset = async () => {
    setImporting(true);
    setError(null);
    try {
      const res = await importInstagramAsDataset();
      setDatasetId(res.data.dataset_id);
      setFilename(res.data.filename);
      setColumnMapping(res.data.detected_mapping);
      navigate('/explorer');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to import dataset');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadMedia();
  }, []);

  const sentimentCounts = {
    positive: mediaList.filter(p => p.sentiment === 'positive').length,
    negative: mediaList.filter(p => p.sentiment === 'negative').length,
    neutral: mediaList.filter(p => p.sentiment === 'neutral' || p.sentiment === 'unknown' || !p.sentiment).length,
  };

  const pieData = [
    { name: 'Positive', value: sentimentCounts.positive, color: 'var(--success)' },
    { name: 'Negative', value: sentimentCounts.negative, color: 'var(--error)' },
    { name: 'Neutral', value: sentimentCounts.neutral, color: 'var(--text-muted)' },
  ].filter(d => d.value > 0);

  const totalLikes = mediaList.reduce((acc, p) => acc + (p.likes_count || 0), 0);
  const totalComments = mediaList.reduce((acc, p) => acc + (p.comments_count || 0), 0);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Instagram Professional Intelligence" 
            subtitle="Meta Graph API Integration for Instagram Business & Creator accounts. Analyze post captions, engagement metrics, and comment sentiments."
          />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={loadStatus} disabled={statusLoading}>
            <RefreshCw size={16} className={statusLoading ? 'animate-spin' : ''} /> Check Status
          </button>
          <button className="btn-primary" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <Loader2 size={16} className="animate-spin" /> : <IgIcon size={16} />}
            {analyzing ? 'Analyzing NLP...' : 'Analyze Instagram Feed'}
          </button>
          <button className="btn-secondary" onClick={handleImportDataset} disabled={importing || mediaList.length === 0}>
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
            Import to Workflow
          </button>
        </div>
      </div>

      {/* Error / Alert Banner */}
      {error && (
        <div style={{ 
          padding: '1rem 1.25rem', 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid var(--error)', 
          borderRadius: 'var(--radius)', 
          color: 'var(--error)', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertCircle size={20} />
          <div style={{ flex: 1, fontSize: '0.875rem' }}>{error}</div>
        </div>
      )}

      {/* Connection & Account Status Card */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: statusData?.connected ? '4px solid var(--success)' : '4px solid var(--warning)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'white'
            }}>
              <IgIcon size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem' }}>
                  {statusData?.account?.username ? `@${statusData.account.username}` : 'Instagram Professional Account'}
                </h3>
                <span className={`badge ${statusData?.connected ? 'badge-success' : 'badge-neutral'}`}>
                  {statusData?.connected ? 'Connected' : 'Meta API Mode'}
                </span>
              </div>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {statusData?.message || 'Meta Graph API Integration for Instagram'}
              </p>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Flow Type</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {statusData?.api_flow || 'Instagram via Facebook Page Link'}
            </div>
          </div>
        </div>

        {statusData?.setup_guide && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--warning)', marginBottom: '0.25rem' }}>Setup Steps for Live Instagram Sync:</div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {statusData.setup_guide.map((step, idx) => <li key={idx}>{step}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard 
          title="Instagram Posts" 
          value={mediaList.length} 
          icon={IgIcon} 
          subtitle="Accessible media items" 
        />
        <MetricCard 
          title="Total Likes" 
          value={totalLikes.toLocaleString()} 
          icon={Heart} 
          subtitle="Direct post likes" 
        />
        <MetricCard 
          title="Total Comments" 
          value={totalComments.toLocaleString()} 
          icon={MessageCircle} 
          subtitle="Audience discussions" 
        />
        <MetricCard 
          title="Positive Sentiment" 
          value={mediaList.length > 0 ? `${Math.round((sentimentCounts.positive / mediaList.length) * 100)}%` : '0%'} 
          icon={CheckCircle} 
          subtitle="ML classified positive" 
        />
      </div>

      {/* Charts Section */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <ChartCard title="Instagram Sentiment Distribution" subtitle="Classified using TF-IDF + Multinomial Naive Bayes">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie 
                  data={pieData} 
                  dataKey="value" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={55} 
                  outerRadius={85} 
                  paddingAngle={4}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Click 'Analyze Instagram Feed' to calculate sentiment distribution.
            </div>
          )}
        </ChartCard>

        <ChartCard title="Engagement Breakdown by Post" subtitle="Likes & Comments per Instagram media item">
          {mediaList.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={mediaList.slice(0, 8)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid {...CHART_STYLES.grid} />
                <XAxis dataKey="id" tickFormatter={(v) => `P-${v.slice(-4)}`} {...CHART_STYLES.axis} />
                <YAxis {...CHART_STYLES.axis} />
                <RechartsTooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                <Bar dataKey="likes_count" name="Likes" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comments_count" name="Comments" fill="#ec4899" radius={[4, 4, 0, 0]} />
                <Legend verticalAlign="bottom" height={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No media posts fetched yet.
            </div>
          )}
        </ChartCard>
      </div>

      {/* Media Feed Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Instagram Posts & Sentiment</h3>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Normalized posts with like counts, comment counts, and model predictions.
            </p>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{mediaList.length} items</span>
        </div>

        {mediaList.length === 0 ? (
          <EmptyState 
            icon={IgIcon}
            title="No Instagram Media Loaded"
            description="Click 'Check Status' or 'Analyze Instagram Feed' to inspect posts."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Caption</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Sentiment</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Likes</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Comments</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mediaList.map((post) => (
                  <tr key={post.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        {post.media_type || 'IMAGE'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '380px' }}>
                      <div style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>
                        {post.caption || post.text || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No caption</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {post.created_time ? new Date(post.created_time).toLocaleString() : ''}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <SentimentBadge sentiment={post.sentiment || 'neutral'} />
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      {post.likes_count ?? 0}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      {post.comments_count ?? 0}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => handleViewComments(post)}
                      >
                        Comments ({post.comments_count || 0})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Comments Drawer / Modal */}
      <AnimatePresence>
        {selectedPost && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem'
          }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                width: '100%',
                maxWidth: '650px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Instagram Comments Sentiment</h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Post: {selectedPost.id}
                  </p>
                </div>
                <button className="btn-secondary" onClick={() => setSelectedPost(null)}>Close</button>
              </div>

              <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
                <div style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Post Caption:</div>
                  <div style={{ fontSize: '0.875rem' }}>{selectedPost.caption || selectedPost.text}</div>
                </div>

                {commentsLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                    Analyzing comments sentiment...
                  </div>
                ) : postComments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No accessible comments found for this Instagram post.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {postComments.map((c) => (
                      <div key={c.id} style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>{c.author || 'Instagram User'}</span>
                          <SentimentBadge sentiment={c.sentiment || 'neutral'} />
                        </div>
                        <div style={{ fontSize: '0.85rem' }}>{c.text || c.message}</div>
                        {c.sentiment_confidence && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Confidence: {Math.round(c.sentiment_confidence * 100)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Instagram;
