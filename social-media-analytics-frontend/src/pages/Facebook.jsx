import React, { useState, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatasetContext } from '../context/DatasetContext';
import { BrainCircuit, MessageSquare as FbIcon, Loader2, RefreshCw, X, BarChart2, Database, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { importFacebookAsDataset, analyzeFacebookPosts, analyzeFacebookPostComments, getFacebookPostInsights } from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import SentimentBadge from '../components/ui/SentimentBadge';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';

const COLORS = {
  positive: 'var(--success)',
  negative: 'var(--error)',
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
  
  const [selectedPost, setSelectedPost] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  
  const [commentsCache, setCommentsCache] = useState({});
  const [insightsCache, setInsightsCache] = useState({});

  const navigate = useNavigate();
  const { setDatasetId, setFilename, setColumnMapping } = useContext(DatasetContext);
  const [importing, setImporting] = useState(false);

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
      setError(err.response?.data?.detail || err.message || 'Failed to import dataset');
    } finally {
      setImporting(false);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedPost(null);
    setCommentsCache({});
    setInsightsCache({});
    try {
      const response = await analyzeFacebookPosts();
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to analyze posts');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (post) => {
    setSelectedPost(post);
    setDetailsError(null);
    
    if (!commentsCache[post.id] || !insightsCache[post.id]) {
      setDetailsLoading(true);
      try {
        const [commentsRes, insightsRes] = await Promise.all([
          analyzeFacebookPostComments(post.id).then(res => res.data).catch(e => null),
          getFacebookPostInsights(post.id).then(res => res.data).catch(e => null)
        ]);
        
        if (commentsRes) setCommentsCache(prev => ({ ...prev, [post.id]: commentsRes }));
        if (insightsRes) setInsightsCache(prev => ({ ...prev, [post.id]: insightsRes }));
      } catch (err) {
        setDetailsError(err.message || 'Failed to fetch details');
      } finally {
        setDetailsLoading(false);
      }
    }
  };

  const { dashboardData, dashboardTrendArray, commentTrendArray, timeOfDayArray } = useMemo(() => {
    let data = {
      postsAnalyzed: 0,
      totalComments: 0,
      positivePosts: 0,
      negativePosts: 0,
      positiveComments: 0,
      negativeComments: 0,
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
        { name: 'negative', value: data.negativeComments }
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
    const insightsData = insightsCache[post.id];
    
    let comparisonInsight = "";
    let audienceReactionState = "Mixed";
    if (commentsData && commentsData.summary) {
      const retrieved = commentsData.summary.total_comments;
      const analyzed = commentsData.summary.comments_analyzed;
      const pos = commentsData.summary.positive_count;
      const neg = commentsData.summary.negative_count;
      const pSentiment = post.sentiment;
      
      if (retrieved === 0) {
        audienceReactionState = "No Comment Data";
        comparisonInsight = "Facebook API restrictions prevent fetching these comments.";
      } else if (pos === 0 && neg === 0) {
        audienceReactionState = "No Analyzable Comments";
        comparisonInsight = "Retrieved comments have no discernible sentiment.";
      } else if (pos === neg) {
        audienceReactionState = "Mixed";
        comparisonInsight = "Comments contain an equal mix of positive and negative sentiment.";
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
    
    const commentChartData = commentsData ? [
      { name: 'positive', value: commentsData.summary.positive_count },
      { name: 'negative', value: commentsData.summary.negative_count },
      { name: 'unknown', value: commentsData.summary.unknown_count || 0 }
    ].filter(d => d.value > 0) : [];

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

              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="grid-2">
                <MetricCard 
                  title="Post Performance"
                  value={insightsData?.available ? (insightsData.impressions || 0) : 'N/A'}
                  subtitle={insightsData?.available ? `Reach: ${insightsData.reach}` : (insightsData?.reason || 'API limitations.')}
                  icon={Users}
                />
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

              {commentsData && commentsData.summary && (
                <>
                  <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="grid-3">
                    <MetricCard title="Total Comments" value={post.comments_count || 0} />
                    <MetricCard title="Retrieved" value={commentsData.summary.total_comments} />
                    <MetricCard title="Analyzed" value={commentsData.summary.comments_analyzed} />
                    <MetricCard title="Positive" value={commentsData.summary.positive_count} color={COLORS.positive} />
                    <MetricCard title="Negative" value={commentsData.summary.negative_count} color={COLORS.negative} />
                    <MetricCard title="Unknown" value={commentsData.summary.unknown_count || 0} color={COLORS.unknown} />
                  </motion.div>

                  <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
                    <ChartCard title="Comment Sentiment Breakdown" height="250px">
                    {commentChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={commentChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label stroke="none">
                            {commentChartData.map((e, i) => <Cell key={i} fill={COLORS[e.name.toLowerCase()]} />)}
                          </Pie>
                          <RechartsTooltip {...CHART_STYLES.tooltip} />
                          <Legend style={{ textTransform: 'capitalize' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState title="No text comments" description="No valid text comments to analyze." />
                    )}
                    </ChartCard>
                  </motion.div>

                  <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="card" style={{ marginBottom: 0, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                      <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Analyzed Comments</h3>
                    </div>
                    <DataTable 
                      columns={commentColumns} 
                      data={commentsData.analyzed_comments} 
                      keyField="id" 
                      emptyMessage={post.comments_count === 0 ? "No comments on this post." : "Comments could not be retrieved due to Facebook API permissions."}
                    />
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
      <button onClick={() => handleViewDetails(row)} className="btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
        View Details
      </button>
    ), align: 'right', width: '120px' }
  ];

  return (
    <div>
      <SectionHeader 
        title="Facebook Analytics" 
        subtitle="Analyze your live Facebook posts, audience reactions, and engagement."
        action={
          <>
            <button onClick={handleImportToWorkflow} disabled={loading || importing || !result} className="btn-secondary">
              {importing ? <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Database size={16} />}
              {importing ? 'Exporting...' : 'Export to Workflow'}
            </button>
            <button onClick={handleAnalyze} disabled={loading || importing} className="btn-primary">
              {loading ? <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <FbIcon size={16} />}
              {loading ? 'Analyzing...' : (result ? 'Refresh Analytics' : 'Analyze My Posts')}
            </button>
          </>
        }
      />

      {error && (
        <div style={{ padding: '1rem', backgroundColor: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius)', marginBottom: '2rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {!result && !loading && !error && (
        <EmptyState 
          icon={FbIcon} 
          title="No Data Fetched" 
          description="Click the Analyze button above to fetch and run machine learning on your latest Facebook posts." 
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
