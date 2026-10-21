import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatasetContext } from '../context/DatasetContext';
import { BrainCircuit, MessageSquare as FbIcon, Loader2, RefreshCw, X, BarChart2, Database, TrendingUp, TrendingDown, Users, CheckCircle, AlertTriangle, Sparkles, Sliders } from 'lucide-react';
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getFacebookStatus, getFacebookPages, selectFacebookPage, 
  loadFacebookDemo, clearFacebookDemo, importFacebookAsDataset, 
  analyzeFacebookPosts, analyzeFacebookPostComments, getFacebookPostInsights 
} from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import SentimentBadge from '../components/ui/SentimentBadge';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { summarizeCommentSentiment } from '../utils/commentSentiment';
import { formatApiError } from '../utils/apiError';

const COLORS = {
  positive: 'var(--success)',
  negative: 'var(--error)',
  neutral: 'var(--text-muted)',
  unknown: 'var(--text-muted)'
};

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' },
    itemStyle: { color: 'var(--text-main)' }
  }
};

const Facebook = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  
  // Facebook Page Discovery State
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedPageName, setSelectedPageName] = useState('');
  const [testPageFound, setTestPageFound] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [statusData, setStatusData] = useState(null);

  const [selectedPost, setSelectedPost] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  
  const [commentsCache, setCommentsCache] = useState({});
  const [insightsCache, setInsightsCache] = useState({});
  const [refreshingPerformance, setRefreshingPerformance] = useState(false);

  const navigate = useNavigate();
  const { setDatasetId, setFilename, setColumnMapping } = useContext(DatasetContext);
  const [importing, setImporting] = useState(false);

  // Discover managed pages on mount
  const fetchPagesAndStatus = async (refresh = false) => {
    setLoadingPages(true);
    setError(null);
    setErrorDetails(null);
    try {
      const [pagesResult, statusResult] = await Promise.allSettled([
        getFacebookPages(refresh).then(r => r.data),
        getFacebookStatus(refresh).then(r => r.data)
      ]);
      const pagesRes = pagesResult.status === 'fulfilled' ? pagesResult.value : null;
      const statusRes = statusResult.status === 'fulfilled' ? statusResult.value : null;
      const failedResult = [statusResult, pagesResult].find(result => result.status === 'rejected');
      if (failedResult) {
        const requestError = failedResult.reason;
        const detail = requestError?.response?.data?.detail;
        setError(formatApiError(requestError, 'Could not reach the Facebook Graph API. Check the backend connection.'));
        setErrorDetails({ status: 'connection_error' });
      }

      if (statusRes) {
        setStatusData(statusRes);
        if (!statusRes.connected && ['token_expired', 'token_invalid', 'permission_error'].includes(statusRes.status)) {
          setError(formatApiError(statusRes.error_message, 'Meta Access Token has expired.'));
          setErrorDetails(statusRes);
        }
      }

      if (pagesRes) {
        if (pagesRes.pages && pagesRes.pages.length > 0) {
          setPages(pagesRes.pages);
          setSelectedPageId(pagesRes.selected_page_id || pagesRes.pages[0].id);
          setSelectedPageName(pagesRes.selected_page_name || pagesRes.pages[0].name);
          setTestPageFound(pagesRes.test_page_found);
        } else if (!pagesRes.connected && pagesRes.error_message) {
          setError(formatApiError(pagesRes.error_message, 'Facebook Pages could not be loaded.'));
          setErrorDetails(pagesRes);
        }
      }
    } catch (err) {
      setError(formatApiError(err, 'Failed to discover Facebook Pages.'));
    } finally {
      setLoadingPages(false);
    }
  };

  useEffect(() => {
    fetchPagesAndStatus();
  }, []);

  const handleSelectPage = async (pageId) => {
    const pageObj = pages.find(p => p.id === pageId);
    const pName = pageObj ? pageObj.name : '';
    setSelectedPageId(pageId);
    setSelectedPageName(pName);
    try {
      await selectFacebookPage(pageId, pName);
    } catch (e) {
      console.warn("Could not save selected page to backend state:", e);
    }
  };

  const handleImportToWorkflow = async () => {
    setImporting(true);
    setError(null);
    try {
      const response = await importFacebookAsDataset();
      setDatasetId(response.data.dataset_id);
      setFilename(response.data.filename);
      setColumnMapping(response.data.detected_mapping);
      navigate('/explorer');
    } catch (err) {
      setError(formatApiError(err, 'Failed to import dataset'));
    } finally {
      setImporting(false);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setSelectedPost(null);
    setCommentsCache({});
    setInsightsCache({});
    try {
      const response = await analyzeFacebookPosts(selectedPageId);
      setResult(response.data);
      setIsDemoMode(false);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(formatApiError(err, 'Failed to analyze posts'));
      if (err.response?.status === 190 || (typeof detail === 'string' && detail.includes("Token Expired")) || (typeof detail?.message === 'string' && detail.message.includes("Token Expired"))) {
        setErrorDetails({
          status: 'token_expired',
          action_required: "Open Settings, replace the Facebook User Access Token with a newly authorized token for the existing Meta app, then test the connection."
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDemo = async () => {
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      await loadFacebookDemo();
      setIsDemoMode(true);
      // Fetch the sample posts using cached mode
      const res = await analyzeFacebookPosts(selectedPageId).catch(() => null);
      if (res && res.data) {
        setResult(res.data);
      } else {
        // Fallback: fetch posts directly
        const postsRes = await getFacebookPosts(selectedPageId, true);
        setResult({
          page_id: selectedPageId || 'demo_page',
          page_name: 'Social Media Sentiment Test Page (Demo)',
          summary: {
            total_posts_fetched: postsRes.data.length,
            posts_analyzed: postsRes.data.length,
            positive_count: postsRes.data.filter(p => p.sentiment === 'positive').length || 2,
            negative_count: postsRes.data.filter(p => p.sentiment === 'negative').length || 1,
            positive_percentage: 66.7,
            negative_percentage: 33.3
          },
          analyzed_posts: postsRes.data.map(p => ({
            id: p.id,
            message: p.message,
            created_time: p.created_time,
            comments_count: p.comments_count,
            likes_count: p.likes_count,
            sentiment: p.sentiment || 'positive',
            is_sample: 1
          }))
        });
      }
    } catch (err) {
      setError(formatApiError(err, 'Failed to load demo data.'));
    } finally {
      setLoading(false);
    }
  };

  const handleClearDemo = async () => {
    try {
      await clearFacebookDemo();
      setIsDemoMode(false);
      setResult(null);
      setError(null);
    } catch (err) {
      console.warn("Failed to clear demo data:", err);
    }
  };

  const handleViewDetails = async (post) => {
    if (detailsLoading) return;
    setSelectedPost(post);
    setDetailsError(null);
    
    setDetailsLoading(true);
    const requests = [analyzeFacebookPostComments(post.id)];
    if (!insightsCache[post.id]) requests.push(getFacebookPostInsights(post.id));
    const [commentsResult, insightsResult] = await Promise.allSettled(requests);
    if (commentsResult.status === 'fulfilled') setCommentsCache(prev => ({ ...prev, [post.id]: commentsResult.value.data }));
    else setDetailsError(formatApiError(commentsResult.reason, 'Could not retrieve Facebook comments.'));
    if (insightsResult?.status === 'fulfilled') setInsightsCache(prev => ({ ...prev, [post.id]: insightsResult.value.data }));
    else if (insightsResult?.status === 'rejected') {
      const reason = formatApiError(insightsResult.reason, 'Could not retrieve Facebook performance metrics.');
      setInsightsCache(prev => ({
        ...prev,
        [post.id]: {
          available: false,
          metrics: Object.fromEntries(['media_views', 'unique_viewers', 'reactions', 'comments', 'shares'].map(key => [key, {
            label: ({ media_views: 'Media views', unique_viewers: 'Unique viewers', reactions: 'Reactions', comments: 'Comments', shares: 'Shares' })[key],
            available: false, value: null, status: 'request_error', reason
          }]))
        }
      }));
    }
    setDetailsLoading(false);
  };

  const refreshPostPerformance = async (postId) => {
    setRefreshingPerformance(true);
    setDetailsError(null);
    try {
      const response = await getFacebookPostInsights(postId, true);
      setInsightsCache(prev => ({ ...prev, [postId]: response.data }));
    } catch (requestError) {
      setDetailsError(formatApiError(requestError, 'Could not refresh Facebook performance metrics.'));
    } finally {
      setRefreshingPerformance(false);
    }
  };

  const handleSyncComments = async (postId, force = true, offset = 0) => {
    setDetailsError(null);
    if (offset === 0) setDetailsLoading(true);
    try {
      const response = await analyzeFacebookPostComments(postId, { force_sync: force, offset, limit: 100 });
      setCommentsCache(prev => {
        const current = prev[postId];
        const incoming = response.data.analyzed_comments || [];
        return { ...prev, [postId]: { ...response.data, analyzed_comments: offset > 0 ? [...(current?.analyzed_comments || []), ...incoming] : incoming } };
      });
    } catch (err) {
      setDetailsError(formatApiError(err, 'Could not sync Facebook comments.'));
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPost?.id) return undefined;
    const timer = window.setInterval(() => {
      handleSyncComments(selectedPost.id, false, 0);
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [selectedPost?.id]);

  const { dashboardData, dashboardTrendArray, commentTrendArray, timeOfDayArray } = useMemo(() => {
    let data = {
      postsAnalyzed: 0,
      totalComments: 0,
      positivePosts: 0,
      negativePosts: 0,
      positiveComments: 0,
      negativeComments: 0,
      neutralComments: 0,
      sentimentData: [],
      commentSentimentData: []
    };
    
    let trendData = {};
    let commentTrendData = {};
    let timeOfDayData = Array.from({ length: 24 }, (_, i) => ({ hour: `${i.toString().padStart(2, '0')}:00`, posts: 0, comments: 0 }));

    if (result && result.analyzed_posts) {
      data.postsAnalyzed = result.summary.posts_analyzed;
      data.positivePosts = result.summary.positive_count;
      data.negativePosts = result.summary.negative_count;
      
      data.sentimentData = [
        { name: 'positive', value: result.summary.positive_count },
        { name: 'negative', value: result.summary.negative_count }
      ].filter(d => d.value > 0);

      result.analyzed_posts.forEach(post => {
        data.totalComments += (post.comments_count || 0);
        
        const dateObj = post.created_time ? new Date(post.created_time) : null;
        if (dateObj && !isNaN(dateObj)) {
          const date = dateObj.toISOString().split('T')[0];
          if (!trendData[date]) {
            trendData[date] = { date, posts: 0, comments: 0, positive: 0, negative: 0 };
          }
          trendData[date].posts += 1;
          trendData[date].comments += (post.comments_count || 0);
          if (post.sentiment === 'positive') trendData[date].positive += 1;
          if (post.sentiment === 'negative') trendData[date].negative += 1;
          
          timeOfDayData[dateObj.getHours()].posts += 1;
        }
      });
      
      Object.values(commentsCache).forEach(cacheItem => {
        if (cacheItem.summary) {
          data.positiveComments += cacheItem.summary.positive_count;
          data.negativeComments += cacheItem.summary.negative_count;
          data.neutralComments += cacheItem.summary.neutral_count || 0;
        }
        
        if (cacheItem.analyzed_comments) {
          cacheItem.analyzed_comments.forEach(comment => {
            const commentDateObj = comment.created_time ? new Date(comment.created_time) : null;
            if (commentDateObj && !isNaN(commentDateObj)) {
              const date = commentDateObj.toISOString().split('T')[0];
              if (!commentTrendData[date]) {
                commentTrendData[date] = { date, comments: 0, positive: 0, negative: 0 };
              }
              commentTrendData[date].comments += 1;
              if (comment.sentiment === 'positive') commentTrendData[date].positive += 1;
              if (comment.sentiment === 'negative') commentTrendData[date].negative += 1;
              
              timeOfDayData[commentDateObj.getHours()].comments += 1;
            }
          });
        }
      });
      
      data.commentSentimentData = [
        { name: 'positive', value: data.positiveComments },
        { name: 'negative', value: data.negativeComments },
        { name: 'neutral', value: data.neutralComments }
      ].filter(d => d.value > 0);
    }
    
    return {
      dashboardData: data,
      dashboardTrendArray: Object.values(trendData).sort((a, b) => new Date(a.date) - new Date(b.date)),
      commentTrendArray: Object.values(commentTrendData).sort((a, b) => new Date(a.date) - new Date(b.date)),
      timeOfDayArray: timeOfDayData
    };
  }, [result, commentsCache]);

  const hasTrendData = dashboardTrendArray.length >= 2;
  const hasCommentTrendData = commentTrendArray.length > 0;
  const hasTimeOfDayData = result?.analyzed_posts?.length > 0;

  const renderDetailsPanel = () => {
    if (!selectedPost) return null;
    const post = selectedPost;
    const commentsData = commentsCache[post.id];
    const sentimentSummary = summarizeCommentSentiment(commentsData?.summary);
    const insightsData = insightsCache[post.id];
    const performanceMetrics = insightsData?.metrics || {};
    const performanceValue = (key) => {
      const metric = performanceMetrics[key];
      return metric?.available && metric.value !== null && metric.value !== undefined ? metric.value : 'Unavailable';
    };
    const performanceSubtitle = (key) => {
      const metric = performanceMetrics[key];
      return metric?.available
        ? (metric.period === 'lifetime' ? 'Lifetime · Meta Graph API' : 'Returned by Meta Graph API')
        : (metric?.reason || 'Meta did not return this metric.');
    };
    
    let comparisonInsight = "";
    let audienceReactionState = "Mixed";
    if (commentsData && commentsData.summary) {
      const retrieved = commentsData.summary.total_comments;
      const analyzed = commentsData.summary.comments_analyzed;
      const pos = commentsData.summary.positive_count;
      const neg = commentsData.summary.negative_count;
      const neutral = commentsData.summary.neutral_count || 0;
      const pSentiment = post.sentiment;
      
      if (retrieved === 0) {
        audienceReactionState = "No Comment Data";
        comparisonInsight = "Facebook API restrictions prevent fetching these comments.";
      } else if (sentimentSummary.comments_analyzed === 0) {
        audienceReactionState = "No Analyzable Comments";
        comparisonInsight = "Retrieved comments have no discernible sentiment.";
      } else if (commentsData.summary.overall_sentiment === 'mixed') {
        audienceReactionState = "Mixed";
        comparisonInsight = `Analyzed comments have a mixed distribution (${pos} positive, ${neg} negative, ${neutral} neutral).`;
      } else if (commentsData.summary.overall_sentiment === 'neutral') {
        audienceReactionState = 'Neutral';
        comparisonInsight = `Neutral comments are the largest group (${neutral} of ${sentimentSummary.comments_analyzed} analyzed).`;
      } else {
        if (pSentiment === 'positive') {
            if (pos > neg) {
                audienceReactionState = "Supportive";
                comparisonInsight = `Comments are predominantly positive (${pos} pos, ${neg} neg), aligning with the post.`;
            } else {
                audienceReactionState = "Opposed";
                comparisonInsight = `Comments are predominantly negative (${pos} pos, ${neg} neg), opposing the post.`;
            }
        } else if (pSentiment === 'negative') {
            if (neg > pos) {
                audienceReactionState = "Supportive";
                comparisonInsight = `Comments are predominantly negative (${pos} pos, ${neg} neg), aligning with the post.`;
            } else {
                audienceReactionState = "Opposed";
                comparisonInsight = `Comments are predominantly positive (${pos} pos, ${neg} neg), opposing the post.`;
            }
        } else {
            if (pos > neg) {
                audienceReactionState = "Positive";
                comparisonInsight = `Comments are predominantly positive (${pos} pos, ${neg} neg).`;
            } else {
                audienceReactionState = "Negative";
                comparisonInsight = `Comments are predominantly negative (${pos} pos, ${neg} neg).`;
            }
        }
      }
    }
    
    const commentChartData = sentimentSummary.chartData;

    const commentColumns = [
      { header: 'Date', cell: row => new Date(row.created_time).toLocaleString(), width: '150px' },
      { header: 'Author', accessor: 'author', width: '150px' },
      { header: 'Comment', accessor: 'message' },
      { header: 'Sentiment', cell: row => <SentimentBadge sentiment={row.sentiment} />, width: '100px' }
    ];

    return (
      <motion.div 
        key="details-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: '800px',
        maxWidth: '100vw',
        backgroundColor: 'var(--bg-color)',
        borderLeft: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Post Details</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>ID: {post.id}</p>
          </div>
          <button onClick={() => setSelectedPost(null)} style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--sidebar-bg)' }}>
            <X size={20} color="var(--text-main)" />
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {detailsLoading ? (
            <PageSkeleton type="dashboard" />
          ) : (
            <motion.div 
              initial="hidden" 
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.1 } }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
            >
              
              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <SentimentBadge sentiment={post.sentiment} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{new Date(post.created_time).toLocaleString()}</span>
                </div>
                <p style={{ fontSize: '1.125rem', lineHeight: 1.6 }}>{post.message}</p>
              </motion.div>

              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="grid-3">
                <MetricCard title="Media Views" value={performanceValue('media_views')} subtitle={performanceSubtitle('media_views')} icon={BarChart2} />
                <MetricCard title="Unique Viewers" value={performanceValue('unique_viewers')} subtitle={performanceSubtitle('unique_viewers')} icon={Users} />
                <MetricCard title="Reactions" value={performanceValue('reactions')} subtitle={performanceSubtitle('reactions')} icon={FbIcon} />
                <MetricCard title="Post Comments" value={performanceValue('comments')} subtitle={performanceSubtitle('comments')} icon={FbIcon} />
                <MetricCard title="Shares" value={performanceValue('shares')} subtitle={performanceSubtitle('shares')} icon={Users} />
                {commentsData?.summary ? (
                  <MetricCard 
                    title="Audience Reaction"
                    value={audienceReactionState}
                    subtitle={comparisonInsight}
                    icon={BrainCircuit}
                    color="var(--primary)"
                  />
                ) : (
                  <MetricCard title="Audience Reaction" value="N/A" subtitle="No comments analyzed" icon={BrainCircuit} />
                )}
              </motion.div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.75rem' }}>
                <button onClick={() => refreshPostPerformance(post.id)} className="btn-secondary" disabled={refreshingPerformance}>
                  <RefreshCw size={14} /> {refreshingPerformance ? 'Refreshing…' : 'Refresh performance'}
                </button>
              </div>

                  {detailsError && <div role="alert" className="card" style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>{detailsError}</div>}
                  {commentsData && commentsData.summary && (
                <>
                  <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="grid-3">
                    <MetricCard title="Total Comments" value={post.comments_count || 0} />
                    <MetricCard title="Retrieved" value={commentsData.summary.total_comments} />
                    <MetricCard title="Analyzed" value={sentimentSummary.comments_analyzed} />
                    {sentimentSummary.cards.map((card) => (
                      <MetricCard key={card.name} title={card.title} value={card.value} color={COLORS[card.name]} />
                    ))}
                    <MetricCard title="Unanalyzed" value={sentimentSummary.unanalyzed_count} color={COLORS.unknown} />
                  </motion.div>

                  <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
                    <ChartCard title="Comment Sentiment Breakdown" height="250px">
                    {commentChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={commentChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, value, percent }) => `${name[0].toUpperCase()}${name.slice(1)} ${value} (${Math.round(percent * 100)}%)`}
                            stroke="none"
                          >
                            {commentChartData.map((e, i) => <Cell key={i} fill={COLORS[e.name.toLowerCase()]} />)}
                          </Pie>
                          <RechartsTooltip
                            {...CHART_STYLES.tooltip}
                            formatter={(value, _name, item) => [`${value} comments (${item.payload.percentage}%)`, item.payload.label]}
                          />
                          <Legend formatter={(name) => `${name[0].toUpperCase()}${name.slice(1)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState title="No text comments" description="No valid text comments to analyze." />
                    )}
                    </ChartCard>
                  </motion.div>

                  <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="card" style={{ marginBottom: 0, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                      <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Facebook Comments · {commentsData.summary.overall_sentiment || 'unknown'} audience sentiment</h3>
                      <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Post sentiment ({post.sentiment}) is separate from comment sentiment. Last sync: {commentsData.sync?.last_synced_at ? new Date(commentsData.sync.last_synced_at).toLocaleString() : 'not available'}.</p>
                      {(commentsData.sync?.error || commentsData.sync?.warning) && <p role="status" style={{ margin: '0.5rem 0 0', color: 'var(--warning)', fontSize: '0.85rem' }}>{commentsData.sync.error || commentsData.sync.warning} Showing saved comments where available.</p>}
                      <button onClick={() => handleSyncComments(post.id, true, 0)} disabled={detailsLoading} className="btn-secondary" style={{ marginTop: '0.75rem' }}>
                        {detailsLoading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Sync comments
                      </button>
                    </div>
                    <DataTable 
                      columns={commentColumns} 
                      data={commentsData.analyzed_comments} 
                      keyField="id" 
                      emptyMessage={commentsData.summary.total_comments === 0 ? "No comments were returned by Facebook for this post." : "Facebook returned comments, but none had visible text to display."}
                    />
                    {commentsData.has_more && <button className="btn-secondary" style={{ margin: '1rem' }} onClick={() => handleSyncComments(post.id, false, commentsData.offset + commentsData.analyzed_comments.length)} disabled={detailsLoading}>Load more comments</button>}
                  </motion.div>
                </>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  };

  const mainTableColumns = [
    { header: 'Date', cell: row => new Date(row.created_time).toLocaleString(), width: '180px' },
    { header: 'Post Preview', cell: row => {
      const msg = row.message || 'No text content';
      return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
    } },
    { header: 'Sentiment', cell: row => <SentimentBadge sentiment={row.sentiment} />, width: '120px' },
    { header: 'Engagement', cell: row => (
      <div style={{ fontSize: '0.875rem' }}>
        <div style={{ color: 'var(--text-main)' }}>💬 {row.comments_count} comments</div>
        <div style={{ color: 'var(--text-muted)' }}>👍 {row.likes_count} likes</div>
      </div>
    ), width: '150px' },
    { header: 'Actions', cell: row => (
      <button onClick={() => handleViewDetails(row)} disabled={detailsLoading} className="btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
        View Details
      </button>
    ), align: 'right', width: '120px' }
  ];

  return (
    <div>
      <SectionHeader 
        title="Facebook Analytics" 
        subtitle="Live Facebook Graph API integration for your managed pages and audience reactions."
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {isDemoMode ? (
              <button onClick={handleClearDemo} className="btn-secondary" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
                Clear Demo Data
              </button>
            ) : (
              <button onClick={handleLoadDemo} disabled={loading} className="btn-secondary" title="Explicitly test dashboard with sample demonstration records">
                <Sparkles size={16} />
                Load Demo Data
              </button>
            )}
            <button onClick={handleImportToWorkflow} disabled={loading || importing || !result} className="btn-secondary">
              {importing ? <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Database size={16} />}
              {importing ? 'Exporting...' : 'Export to Workflow'}
            </button>
            <button onClick={handleAnalyze} disabled={loading || importing} className="btn-primary">
              {loading ? <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <FbIcon size={16} />}
              {loading ? 'Analyzing...' : (result ? 'Refresh Page Analytics' : 'Analyze Page Posts')}
            </button>
          </div>
        }
      />

      {/* Facebook Page Discovery & Selection Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', backgroundColor: 'var(--card-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
            <FbIcon size={20} color="var(--primary)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Connected Facebook Page:
              </div>
              {pages.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <select 
                    value={selectedPageId} 
                    onChange={e => handleSelectPage(e.target.value)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-dark)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      minWidth: '240px'
                    }}
                  >
                    {pages.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.is_test_page ? '★ (Test Page)' : ''} ({p.id})
                      </option>
                    ))}
                  </select>
                  {testPageFound && (
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <CheckCircle size={13} /> Social Media Sentiment Test Page Verified
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                  {loadingPages ? 'Discovering pages via /me/accounts...' : (selectedPageName || 'Social Media Sentiment Test Page (Configured via .env)')}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button onClick={() => fetchPagesAndStatus(true)} disabled={loadingPages} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
              <RefreshCw size={13} className={loadingPages ? 'spin' : ''} />
              {loadingPages ? 'Verifying...' : 'Check Access'}
            </button>
          </div>
        </div>
      </div>

      {/* Demo Mode Active Banner */}
      {isDemoMode && (
        <div style={{ 
          padding: '0.85rem 1.25rem', 
          backgroundColor: 'rgba(234, 179, 8, 0.1)', 
          border: '1px solid rgba(234, 179, 8, 0.3)', 
          borderRadius: 'var(--radius)', 
          marginBottom: '1.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--warning)' }}>
            <Sparkles size={18} />
            <div>
              <strong style={{ fontSize: '0.88rem' }}>Demo Mode Active:</strong>
              <span style={{ fontSize: '0.82rem', marginLeft: '0.35rem', color: 'var(--text-main)' }}>
                Displaying synthetic demonstration records for evaluation. Live Facebook data is isolated.
              </span>
            </div>
          </div>
          <button onClick={handleClearDemo} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderColor: 'var(--warning)', color: 'var(--warning)' }}>
            Switch to Live Facebook Data
          </button>
        </div>
      )}

      {/* Error / Token Diagnostic Banner */}
      {error && (
        <div style={{ 
          padding: '1.25rem', 
          backgroundColor: 'rgba(239, 68, 68, 0.08)', 
          color: 'var(--text-main)', 
          borderRadius: 'var(--radius)', 
          marginBottom: '2rem', 
          border: '1px solid rgba(239, 68, 68, 0.25)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <AlertTriangle size={22} color="var(--error)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--error)', fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                Facebook Graph API Notice
              </div>
              <div style={{ fontSize: '0.86rem', color: 'var(--text-main)', marginBottom: '0.6rem', lineHeight: '1.4' }}>
                {error}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                <strong>Required Meta Permissions:</strong> <code>pages_show_list</code>, <code>pages_read_engagement</code>, and <code>pages_read_user_content</code> for reading Page comments.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/settings')} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
                  Update Facebook Token in Settings
                </button>
                <button onClick={handleLoadDemo} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
                  <Sparkles size={14} />
                  Load Demo Data to Test Features
                </button>
                <button onClick={fetchPagesAndStatus} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
                  Retry Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <EmptyState 
          icon={FbIcon} 
          title="No Posts Fetched Yet" 
          description="Click 'Analyze Page Posts' to fetch and run machine learning sentiment analysis on your latest Facebook posts, or click 'Load Demo Data' to preview with sample records." 
        />
      )}


      {result && (
        <>
          <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
            <MetricCard title="Posts Analyzed" value={dashboardData.postsAnalyzed} icon={FbIcon} />
            <MetricCard title="Positive Posts" value={dashboardData.positivePosts} color={COLORS.positive} icon={TrendingUp} />
            <MetricCard title="Negative Posts" value={dashboardData.negativePosts} color={COLORS.negative} icon={TrendingDown} />
          </div>
          
          <div className="grid-3" style={{ marginBottom: '2rem' }}>
            <MetricCard title="Total Comments (All Posts)" value={dashboardData.totalComments} icon={Users} />
            <MetricCard title="Analyzed Pos. Comments" value={dashboardData.positiveComments} color={COLORS.positive} icon={TrendingUp} />
            <MetricCard title="Analyzed Neg. Comments" value={dashboardData.negativeComments} color={COLORS.negative} icon={TrendingDown} />
            <MetricCard title="Analyzed Neutral Comments" value={dashboardData.neutralComments} color={COLORS.neutral} icon={BrainCircuit} />
          </div>

          <div className="grid-2" style={{ marginBottom: '2rem' }}>
            <ChartCard title="Post Sentiment Distribution">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dashboardData.sentimentData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} dataKey="value" label stroke="none">
                    {dashboardData.sentimentData.map((e, i) => <Cell key={i} fill={COLORS[e.name.toLowerCase()]} />)}
                  </Pie>
                  <RechartsTooltip {...CHART_STYLES.tooltip} />
                  <Legend style={{ textTransform: 'capitalize' }} wrapperStyle={{ paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Comment Sentiment Distribution (Analyzed)">
              {dashboardData.commentSentimentData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dashboardData.commentSentimentData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} dataKey="value" label stroke="none">
                      {dashboardData.commentSentimentData.map((e, i) => <Cell key={i} fill={COLORS[e.name.toLowerCase()]} />)}
                    </Pie>
                    <RechartsTooltip {...CHART_STYLES.tooltip} />
                    <Legend style={{ textTransform: 'capitalize' }} wrapperStyle={{ paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No Analyzed Comments" description="Click 'View Details' on a post below to analyze its comments." />
              )}
            </ChartCard>
          </div>
          
          <div className="grid-2" style={{ marginBottom: '2rem' }}>
            <ChartCard title="Post Activity Over Time">
              {hasTrendData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardTrendArray} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid {...CHART_STYLES.grid} />
                    <XAxis dataKey="date" {...CHART_STYLES.axis} />
                    <YAxis {...CHART_STYLES.axis} />
                    <RechartsTooltip {...CHART_STYLES.tooltip} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="posts" name="Posts" fill="var(--primary)" radius={[4,4,0,0]} barSize={20} />
                    <Bar dataKey="comments" name="Total Comments" fill="#8b5cf6" radius={[4,4,0,0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="Not enough data" description="Post activity temporal trends require multiple days of data." />
              )}
            </ChartCard>

            <ChartCard title="Analyzed Comment Activity Over Time">
              {hasCommentTrendData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={commentTrendArray} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid {...CHART_STYLES.grid} />
                    <XAxis dataKey="date" {...CHART_STYLES.axis} />
                    <YAxis {...CHART_STYLES.axis} />
                    <RechartsTooltip {...CHART_STYLES.tooltip} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Line type="monotone" dataKey="positive" name="Positive Comments" stroke={COLORS.positive} strokeWidth={3} dot={{r:4}} />
                    <Line type="monotone" dataKey="negative" name="Negative Comments" stroke={COLORS.negative} strokeWidth={3} dot={{r:4}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No Comment Data" description="Click 'View Details' to fetch comment activity." />
              )}
            </ChartCard>
          </div>

          <div className="grid-1" style={{ marginBottom: '2rem' }}>
            <ChartCard title="Activity by Time of Day (Hourly)">
              {hasTimeOfDayData ? (
                <ResponsiveContainer width="100%" height="300px">
                  <BarChart data={timeOfDayArray} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid {...CHART_STYLES.grid} />
                    <XAxis dataKey="hour" {...CHART_STYLES.axis} />
                    <YAxis {...CHART_STYLES.axis} />
                    <RechartsTooltip {...CHART_STYLES.tooltip} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="posts" name="Posts" fill="var(--primary)" radius={[4,4,0,0]} barSize={20} />
                    <Bar dataKey="comments" name="Comments (Analyzed)" fill="#8b5cf6" radius={[4,4,0,0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No Data" description="No post data available for time analysis." />
              )}
            </ChartCard>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Facebook Posts Log</h3>
            </div>
            <DataTable 
              columns={mainTableColumns}
              data={result.analyzed_posts}
              keyField="id"
              emptyMessage="No valid posts found with text content to display."
            />
          </div>
        </>
      )}

      <AnimatePresence>
        {selectedPost && renderDetailsPanel()}
        
        {/* Backdrop for side panel */}
        {selectedPost && (
          <motion.div 
            key="details-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedPost(null)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40, backdropFilter: 'blur(2px)' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Facebook;
