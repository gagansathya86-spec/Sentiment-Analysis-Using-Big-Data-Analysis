import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, MessageCircle, RefreshCw, Sparkles, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { IgIcon } from '../components/BrandIcons';
import { analyzeInstagramComments, analyzeInstagramMedia, getInstagramAccounts, getInstagramInsights, getInstagramMedia, getInstagramMediaInsights, getInstagramStatus, selectInstagramAccount, syncInstagramMedia } from '../services/api';
import { usePlatform } from '../context/PlatformContext';
import MetricCard from '../components/ui/MetricCard';
import SectionHeader from '../components/ui/SectionHeader';
import ChartCard from '../components/ui/ChartCard';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import SentimentBadge from '../components/ui/SentimentBadge';
import { formatApiError } from '../utils/apiError';
import { countSentiments, deriveInstagramActivity, isClassified, sentimentNames, sentimentRows, validDate } from '../utils/instagramAnalytics';

const chartColors = { positive: 'var(--success)', negative: 'var(--error)', neutral: 'var(--text-muted)' };
const chartStyles = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }, itemStyle: { color: 'var(--text-main)' } },
};
const metricText = (value) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';
const emptyAnalytics = (title, description) => <EmptyState title={title} description={description} />;

const Instagram = () => {
  const { instagramStatus } = usePlatform();
  const [status, setStatus] = useState(instagramStatus);
  const [accounts, setAccounts] = useState([]);
  const [media, setMedia] = useState([]);
  const [comments, setComments] = useState({});
  const [mediaInsights, setMediaInsights] = useState({});
  const [insightLoading, setInsightLoading] = useState({});
  const [accountInsights, setAccountInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const [accountInsightsLoading, setAccountInsightsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState(null);

  const loadStatus = useCallback(async (refresh = false) => {
    try {
      const response = await getInstagramStatus(refresh);
      setStatus(response.data);
      return response.data;
    } catch (requestError) {
      const message = formatApiError(requestError, 'Could not verify the Instagram connection.');
      setStatus({ connected: null, status: 'error', error: message, http_status: requestError.response?.status });
      setError(message);
      return null;
    }
  }, []);

  const loadMedia = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const response = await getInstagramMedia(100, null, refresh);
      setMedia(Array.isArray(response.data?.data) ? response.data.data : []);
      setError(null);
    } catch (requestError) {
      setError(formatApiError(requestError, 'Could not load Instagram media.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setStatus(instagramStatus);
    let active = true;
    (async () => {
      const currentStatus = instagramStatus?.connected ? instagramStatus : await loadStatus();
      if (!active || !currentStatus?.connected) return;
      try {
        const [accountResult, insightsResult] = await Promise.allSettled([getInstagramAccounts(), getInstagramInsights()]);
        if (!active) return;
        if (accountResult.status === 'fulfilled') setAccounts(accountResult.value.data?.accounts || []);
        else setError(formatApiError(accountResult.reason, 'Could not retrieve Instagram accounts.'));
        if (insightsResult.status === 'fulfilled') setAccountInsights(insightsResult.value.data);
        else setAccountInsights(null);
      } catch (requestError) {
        if (active) setError(formatApiError(requestError, 'Could not load Instagram analytics.'));
      }
      if (active) await loadMedia();
    })();
    return () => { active = false; };
  }, [instagramStatus, loadStatus, loadMedia]);

  const checkConnection = async () => {
    if (metaBusy) return;
    setMetaBusy(true);
    setError(null);
    try {
      const latest = await loadStatus(true);
      if (latest?.connected) {
        const [accountResult, insightsResult] = await Promise.all([getInstagramAccounts(true), getInstagramInsights(true)]);
        setAccounts(accountResult.data?.accounts || []);
        setAccountInsights(insightsResult.data);
        await loadMedia(true);
      }
    } catch (requestError) {
      setError(formatApiError(requestError, 'Could not refresh Instagram connection details.'));
    } finally { setMetaBusy(false); }
  };

  const changeAccount = async (accountId) => {
    if (metaBusy) return;
    setMetaBusy(true);
    setError(null);
    try {
      await selectInstagramAccount(accountId);
      setComments({});
      const latest = await loadStatus(true);
      if (latest?.connected) await loadMedia(true);
      const insights = await getInstagramInsights(true);
      setAccountInsights(insights.data);
    } catch (requestError) {
      setError(formatApiError(requestError, 'Could not select or load the Instagram account.'));
    } finally { setMetaBusy(false); }
  };

  const syncMedia = async () => {
    if (metaBusy) return;
    setMetaBusy(true); setSyncing(true); setError(null); setNotice(null);
    try {
      const result = await syncInstagramMedia();
      setNotice(`${result.data.records_synced} media records synchronized${result.data.has_more ? ' (more remain; sync again to continue)' : ''}.`);
      await loadMedia(true);
    } catch (requestError) {
      setError(formatApiError(requestError, 'Instagram media synchronization failed.'));
    } finally { setSyncing(false); setMetaBusy(false); }
  };

  const analyzeCaptions = async () => {
    if (metaBusy || !media.length) return;
    setMetaBusy(true); setAnalyzing(true); setError(null); setNotice(null);
    try {
      const result = await analyzeInstagramMedia();
      setMedia(Array.isArray(result.data?.media) ? result.data.media : result.data?.analyzed_posts || []);
      const count = result.data?.summary?.posts_analyzed;
      setNotice(`${Number.isFinite(count) ? count : 0} Instagram captions classified with the existing sentiment model.`);
    } catch (requestError) {
      setError(formatApiError(requestError, 'Instagram caption analysis failed.'));
    } finally { setAnalyzing(false); setMetaBusy(false); }
  };

  const loadAccountInsights = async () => {
    if (metaBusy) return;
    setMetaBusy(true); setAccountInsightsLoading(true);
    try {
      const result = await getInstagramInsights(true);
      setAccountInsights(result.data);
      setError(null);
    } catch (requestError) {
      setError(formatApiError(requestError, 'Could not refresh Instagram insights.'));
    } finally { setAccountInsightsLoading(false); setMetaBusy(false); }
  };

  const analyzeComments = async (post) => {
    if (metaBusy) return;
    setMetaBusy(true);
    setComments((current) => ({ ...current, [post.id]: { ...(current[post.id] || {}), loading: true, error: null } }));
    setError(null);
    try {
      const response = await analyzeInstagramComments(post.id, 100);
      const items = Array.isArray(response.data?.analyzed_comments) ? response.data.analyzed_comments : [];
      setComments((current) => ({ ...current, [post.id]: { items, loaded: true, loading: false, message: response.data?.message || null } }));
    } catch (requestError) {
      const message = formatApiError(requestError, 'Could not retrieve and analyze Instagram comments.');
      setComments((current) => ({ ...current, [post.id]: { ...(current[post.id] || {}), loading: false, error: message } }));
      setError(message);
    } finally { setMetaBusy(false); }
  };

  const loadMediaInsights = async (post, refresh = false) => {
    if (metaBusy) return;
    setMetaBusy(true);
    setInsightLoading((current) => ({ ...current, [post.id]: true }));
    setError(null);
    try {
      const response = await getInstagramMediaInsights(post.id, refresh);
      setMediaInsights((current) => ({ ...current, [post.id]: response.data }));
    } catch (requestError) {
      setError(formatApiError(requestError, 'Could not retrieve Instagram media insights.'));
    } finally {
      setInsightLoading((current) => ({ ...current, [post.id]: false }));
      setMetaBusy(false);
    }
  };

  const analyzedMedia = useMemo(() => media.filter(isClassified), [media]);
  const commentRows = useMemo(() => Object.values(comments).filter((group) => group.loaded).flatMap((group) => group.items || []), [comments]);
  const analyzedComments = useMemo(() => commentRows.filter(isClassified), [commentRows]);
  const captionDistribution = useMemo(() => sentimentRows(analyzedMedia), [analyzedMedia]);
  const commentDistribution = useMemo(() => sentimentRows(analyzedComments), [analyzedComments]);
  const { mediaTrend, commentTrend, hourlyActivity } = useMemo(() => deriveInstagramActivity(media, analyzedComments), [media, analyzedComments]);
  const captionCounts = useMemo(() => countSentiments(analyzedMedia), [analyzedMedia]);
  const commentCounts = useMemo(() => countSentiments(analyzedComments), [analyzedComments]);
  const totalComments = commentRows.length;

  const sentimentHasRun = media.some(isClassified);
  const account = status?.account || {};
  const page = status?.facebook_page || {};

  const columns = [
    { header: 'Date', width: '170px', cell: (post) => validDate(post.created_time) ? validDate(post.created_time).toLocaleString() : 'Unavailable' },
    { header: 'Media Preview', width: '120px', cell: (post) => {
      const src = post.thumbnail_url || post.platform_metrics?.thumbnail_url || post.media_url || post.platform_metrics?.media_url;
      if (!src) return <span style={{ color: 'var(--text-muted)' }}>{post.media_type || 'Media'}</span>;
      return post.media_type === 'VIDEO' || post.media_type === 'REELS'
        ? <video src={post.media_url || post.platform_metrics?.media_url || src} poster={post.thumbnail_url || post.platform_metrics?.thumbnail_url || undefined} controls muted style={{ width: 90, maxHeight: 70, objectFit: 'cover', borderRadius: 6 }} aria-label={`${post.media_type} preview`} />
        : <img src={src} alt={`${post.media_type || 'Instagram'} media preview`} loading="lazy" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6 }} />;
    } },
    { header: 'Caption / Post Preview', cell: (post) => {
      const caption = post.text || post.caption || '';
      return <span title={caption}>{caption ? (caption.length > 120 ? `${caption.slice(0, 120)}…` : caption) : 'No caption available'}</span>;
    } },
    { header: 'Sentiment', width: '140px', cell: (post) => <div><SentimentBadge sentiment={isClassified(post) ? post.sentiment : 'unknown'} />{isClassified(post) && typeof post.sentiment_confidence === 'number' && <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 4 }}>{(post.sentiment_confidence * 100).toFixed(1)}% confidence</small>}</div> },
    { header: 'Engagement', width: '145px', cell: (post) => <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}><div>♥ {metricText(post.likes_count)} likes</div><div><MessageCircle size={13} style={{ verticalAlign: 'middle' }} /> {metricText(post.comments_count)} comments</div></div> },
    { header: 'Actions', align: 'right', width: '175px', cell: (post) => <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}><button type="button" className="btn-primary" style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }} onClick={() => setSelectedMedia(post)}>View Details</button>{post.permalink && <a className="btn-secondary" href={post.permalink} target="_blank" rel="noreferrer" style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}>Open post</a>}</div> },
  ];

  return <div>
    <SectionHeader title="Instagram Analytics" subtitle="Live Instagram Graph API integration for the connected professional account and its accessible media and comments." action={<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <button type="button" onClick={checkConnection} disabled={metaBusy} className="btn-secondary"><RefreshCw size={15} /> Check Connection</button>
      <button type="button" onClick={syncMedia} disabled={metaBusy || !status?.connected} className="btn-secondary"><RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing…' : 'Sync Media'}</button>
      <button type="button" onClick={analyzeCaptions} disabled={metaBusy || media.length === 0} className="btn-primary"><Sparkles size={15} /> {analyzing ? 'Analyzing…' : 'Analyze Captions'}</button>
      <button type="button" onClick={loadAccountInsights} disabled={metaBusy || !status?.connected} className="btn-secondary"><RefreshCw size={15} /> {accountInsightsLoading ? 'Refreshing…' : 'Refresh Insights'}</button>
    </div>} />

    <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><IgIcon color="#d9468d" /><div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Instagram connection</div>
          <strong>{account.username ? `@${account.username}` : status?.status === 'error' ? 'Unable to verify connection' : 'Instagram account not connected'}</strong>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 3 }}>{status?.connected ? `Connected${account.account_type ? ` · ${account.account_type}` : ''}${page.name || page.id ? ` · linked Facebook Page ${page.name || page.id}` : ''}` : status?.status === 'error' ? formatApiError(status.error) : 'Connect a Professional account through the linked Facebook Page.'}</div>
        </div></div>
        {accounts.length > 1 && <label style={{ fontSize: '0.8rem' }}>Instagram account <select disabled={metaBusy} value={account.id || ''} onChange={(event) => changeAccount(event.target.value)} aria-label="Instagram account">{accounts.map((item) => <option key={item.id} value={item.id}>@{item.username || item.id} · {item.page_name || item.page_id}</option>)}</select></label>}
        <span style={{ color: status?.connected ? 'var(--success)' : status?.status === 'error' ? 'var(--error)' : 'var(--text-muted)', fontWeight: 600 }}>{status?.connected ? 'Connected' : status?.status === 'error' ? `Error${status.http_status ? ` · HTTP ${status.http_status}` : ''}` : 'Not connected'}</span>
      </div>
    </div>

    {error && <div role="alert" className="card" style={{ color: 'var(--error)', borderColor: 'var(--error)', marginBottom: '1.25rem' }}><AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: 7 }} />{formatApiError(error)}</div>}
    {notice && <div role="status" className="card" style={{ color: 'var(--success)', marginBottom: '1.25rem' }}><CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: 7 }} />{notice}</div>}

    <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
      <MetricCard title="Media Analyzed" value={sentimentHasRun ? analyzedMedia.length : '—'} subtitle={sentimentHasRun ? 'Classified captions only' : 'Run Analyze Captions to classify available text'} icon={IgIcon} />
      <MetricCard title="Positive Captions" value={sentimentHasRun ? captionCounts.positive : '—'} icon={TrendingUp} color={chartColors.positive} />
      <MetricCard title="Negative Captions" value={sentimentHasRun ? captionCounts.negative : '—'} icon={TrendingDown} color={chartColors.negative} />
      <MetricCard title="Neutral Captions" value={sentimentHasRun ? captionCounts.neutral : '—'} icon={Sparkles} color={chartColors.neutral} />
      <MetricCard title="Retrieved Comments" value={Object.values(comments).some((group) => group.loaded) ? totalComments : '—'} subtitle="Comments actually returned by Instagram" icon={Users} />
      <MetricCard title="Analyzed Positive Comments" value={Object.values(comments).some((group) => group.loaded) ? commentCounts.positive : '—'} icon={TrendingUp} color={chartColors.positive} />
      <MetricCard title="Analyzed Negative Comments" value={Object.values(comments).some((group) => group.loaded) ? commentCounts.negative : '—'} icon={TrendingDown} color={chartColors.negative} />
      <MetricCard title="Analyzed Neutral Comments" value={Object.values(comments).some((group) => group.loaded) ? commentCounts.neutral : '—'} icon={Sparkles} color={chartColors.neutral} />
    </div>

    <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
      <ChartCard title="Caption Sentiment Distribution">
        {captionDistribution.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={captionDistribution} cx="50%" cy="50%" innerRadius={65} outerRadius={100} dataKey="value" nameKey="name" label stroke="none">{captionDistribution.map((row) => <Cell key={row.name} fill={chartColors[row.name]} />)}</Pie><RechartsTooltip {...chartStyles.tooltip} /><Legend /></PieChart></ResponsiveContainer> : emptyAnalytics('No analyzed captions', 'Analyze captions with the existing sentiment model to populate this chart.')}
      </ChartCard>
      <ChartCard title="Comment Sentiment Distribution (Analyzed)">
        {commentDistribution.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={commentDistribution} cx="50%" cy="50%" innerRadius={65} outerRadius={100} dataKey="value" nameKey="name" label stroke="none">{commentDistribution.map((row) => <Cell key={row.name} fill={chartColors[row.name]} />)}</Pie><RechartsTooltip {...chartStyles.tooltip} /><Legend /></PieChart></ResponsiveContainer> : emptyAnalytics('No analyzed comments', 'Open a media item and analyze its accessible comments to populate this chart.')}
      </ChartCard>
      <ChartCard title="Media Activity Over Time">
        {mediaTrend.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={mediaTrend} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}><CartesianGrid {...chartStyles.grid} /><XAxis dataKey="date" {...chartStyles.axis} /><YAxis {...chartStyles.axis} allowDecimals={false} /><RechartsTooltip {...chartStyles.tooltip} /><Legend /><Bar dataKey="media" name="Media items" fill="var(--primary)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : emptyAnalytics('No timestamped media', 'Instagram did not return valid publication timestamps for the loaded media.')}
      </ChartCard>
      <ChartCard title="Analyzed Comment Activity Over Time">
        {commentTrend.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={commentTrend} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}><CartesianGrid {...chartStyles.grid} /><XAxis dataKey="date" {...chartStyles.axis} /><YAxis {...chartStyles.axis} allowDecimals={false} /><RechartsTooltip {...chartStyles.tooltip} /><Legend /><Line type="monotone" dataKey="positive" name="Positive" stroke={chartColors.positive} strokeWidth={2} dot /><Line type="monotone" dataKey="negative" name="Negative" stroke={chartColors.negative} strokeWidth={2} dot /><Line type="monotone" dataKey="neutral" name="Neutral" stroke={chartColors.neutral} strokeWidth={2} dot /></LineChart></ResponsiveContainer> : emptyAnalytics('No analyzed comment activity', 'Comment trends appear after comments are retrieved and classified with valid timestamps.')}
      </ChartCard>
      <div className="grid-1" style={{ gridColumn: '1 / -1' }}><ChartCard title="Activity by Time of Day (from returned timestamps)">
        {hourlyActivity.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={hourlyActivity} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}><CartesianGrid {...chartStyles.grid} /><XAxis dataKey="hour" {...chartStyles.axis} /><YAxis {...chartStyles.axis} allowDecimals={false} /><RechartsTooltip {...chartStyles.tooltip} /><Legend /><Bar dataKey="media" name="Media items" fill="var(--primary)" radius={[4, 4, 0, 0]} /><Bar dataKey="comments" name="Retrieved comments" fill="#8b5cf6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : emptyAnalytics('No activity timestamps', 'No valid media or retrieved comment timestamps are available.')}
      </ChartCard></div>
    </div>

    {accountInsights && <div className="card" style={{ marginBottom: '1.5rem' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Account Insights · Graph API {accountInsights.api_version || 'configured version'}</h3><button type="button" className="btn-secondary" onClick={loadAccountInsights} disabled={metaBusy}><RefreshCw size={14} /> {accountInsightsLoading ? 'Refreshing…' : 'Refresh Insights'}</button></div>{accountInsights.available ? <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '1rem' }}>{Object.entries(accountInsights.data || {}).map(([name, metric]) => { const values = metric?.values || []; const latest = values.length ? values[values.length - 1] : null; const value = metric?.total_value?.value ?? latest?.value ?? metric?.value; return <div key={name} style={{ minWidth: 130 }}><strong>{name.replaceAll('_', ' ')}</strong><div>{metricText(value)}</div>{latest?.end_time && <small style={{ color: 'var(--text-muted)' }}>through {latest.end_time}</small>}</div>; })}</div> : <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>{accountInsights.message || 'Instagram insights are unavailable for this account or token.'} {Object.entries(accountInsights.unavailable || {}).map(([key, reason]) => `${key}: ${typeof reason === 'string' ? reason : reason?.message || 'unavailable'}`).join(' · ')}</p>}</div>}

    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}><h3 style={{ margin: 0, fontSize: '1.25rem' }}>Instagram Media Log</h3></div>
      {loading ? <div style={{ padding: '2rem' }}><p>Loading Instagram media…</p></div> : <DataTable columns={columns} data={media} keyField="id" emptyMessage={error ? 'Instagram media could not be loaded. See the error above for details.' : status?.connected ? 'No accessible Instagram media was returned. Use Sync Media to refresh.' : 'Connect an Instagram Professional account to load media.'} />}
    </div>

    {selectedMedia && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMedia(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.68)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="instagram-detail-title" className="card" style={{ width: 'min(900px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem', marginBottom: '1rem' }}><h2 id="instagram-detail-title" style={{ margin: 0, fontSize: '1.15rem' }}>Instagram Media Details</h2><button type="button" className="btn-secondary" onClick={() => setSelectedMedia(null)}>Close</button></div>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div>{selectedMedia.media_type === 'VIDEO' || selectedMedia.media_type === 'REELS' ? selectedMedia.media_url || selectedMedia.platform_metrics?.media_url ? <video src={selectedMedia.media_url || selectedMedia.platform_metrics?.media_url} poster={selectedMedia.thumbnail_url || selectedMedia.platform_metrics?.thumbnail_url || undefined} controls style={{ width: '100%', maxHeight: 360, borderRadius: 8 }} /> : <div className="card">Video preview unavailable</div> : selectedMedia.media_url || selectedMedia.thumbnail_url || selectedMedia.platform_metrics?.media_url || selectedMedia.platform_metrics?.thumbnail_url ? <img src={selectedMedia.media_url || selectedMedia.thumbnail_url || selectedMedia.platform_metrics?.media_url || selectedMedia.platform_metrics?.thumbnail_url} alt="Instagram media" style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 8 }} /> : <div className="card">Media preview unavailable</div>}</div>
          <div><p><strong>Media type:</strong> {selectedMedia.media_type || 'Unavailable'}</p><p><strong>Published:</strong> {validDate(selectedMedia.created_time) ? validDate(selectedMedia.created_time).toLocaleString() : 'Timestamp unavailable'}</p><p><strong>Likes:</strong> {metricText(selectedMedia.likes_count)} · <strong>Comments:</strong> {metricText(selectedMedia.comments_count)}</p><p><strong>Caption sentiment:</strong> {isClassified(selectedMedia) ? selectedMedia.sentiment : 'Not analyzed'}{typeof selectedMedia.sentiment_confidence === 'number' ? ` (${(selectedMedia.sentiment_confidence * 100).toFixed(1)}% confidence)` : ''}</p><p style={{ whiteSpace: 'pre-wrap' }}><strong>Full caption:</strong><br />{selectedMedia.text || selectedMedia.caption || 'No caption available'}</p>{selectedMedia.permalink && <p><a href={selectedMedia.permalink} target="_blank" rel="noreferrer">Open original Instagram post</a></p>}
            <button type="button" className="btn-primary" disabled={metaBusy} onClick={() => analyzeComments(selectedMedia)}><MessageCircle size={15} /> {comments[selectedMedia.id]?.loading ? 'Analyzing comments…' : 'Analyze Comments'}</button>
            <button type="button" className="btn-secondary" style={{ marginLeft: 8 }} disabled={metaBusy} onClick={() => loadMediaInsights(selectedMedia, Boolean(mediaInsights[selectedMedia.id]))}><Sparkles size={15} /> {insightLoading[selectedMedia.id] ? 'Loading insights…' : mediaInsights[selectedMedia.id] ? 'Refresh Media Insights' : 'Load Media Insights'}</button>
          </div>
        </div>
        {mediaInsights[selectedMedia.id] && <div style={{ marginTop: '1rem', padding: '0.85rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}><h3 style={{ marginTop: 0 }}>Media Insights · {mediaInsights[selectedMedia.id].media_type || selectedMedia.media_type || 'media type unavailable'}</h3>{Object.entries(mediaInsights[selectedMedia.id].data || {}).map(([name, metric]) => { const value = metric?.total_value?.value ?? metric?.values?.at?.(-1)?.value ?? metric?.value; const status = mediaInsights[selectedMedia.id].statuses?.[name]; const reason = mediaInsights[selectedMedia.id].unavailable?.[name]; const statusLabel = { permission_required: 'Permission required', not_supported: 'Not supported', temporarily_unavailable: 'Temporarily unavailable' }[status] || 'Temporarily unavailable'; return <div key={name}><strong>{name.replaceAll('_', ' ')}:</strong> {value !== null && value !== undefined ? metricText(value) : <span>{statusLabel}{reason ? ` — ${formatApiError(reason, 'Meta did not return this metric.')}` : ''}</span>}</div>; })}{Object.values(mediaInsights[selectedMedia.id].statuses || {}).every((status) => status !== 'available') && <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Instagram media insights depend on media type, account eligibility, and the Meta app’s approved access. For the Facebook Login flow, verify `instagram_manage_insights` access and its required permissions (`instagram_basic`, `pages_read_engagement`, and `pages_show_list`) in Meta App Review and the connected account’s grants. A permission grant alone does not guarantee every metric is supported.</p>}</div>}
        {comments[selectedMedia.id]?.error && <p role="alert" style={{ color: 'var(--error)' }}><AlertCircle size={15} /> {comments[selectedMedia.id].error}</p>}
        {comments[selectedMedia.id]?.loaded && <div style={{ marginTop: '1.25rem' }}><h3>Accessible Comments · {comments[selectedMedia.id].items.length}</h3>{comments[selectedMedia.id].message && <p style={{ color: 'var(--text-muted)' }}>{comments[selectedMedia.id].message}</p>}{comments[selectedMedia.id].items.length ? <DataTable columns={[
          { header: 'Date', cell: (item) => validDate(item.created_time || item.timestamp)?.toLocaleString() || 'Unavailable', width: '180px' },
          { header: 'Comment', cell: (item) => item.text || 'No comment text returned' },
          { header: 'Sentiment', cell: (item) => isClassified(item) ? <SentimentBadge sentiment={item.sentiment} /> : 'Not analyzed' },
        ]} data={comments[selectedMedia.id].items} keyField="id" emptyMessage="No accessible comments were returned." /> : <p style={{ color: 'var(--text-muted)' }}>No accessible comments were returned for this media.</p>}</div>}
      </section>
    </div>}
    {!status?.connected && !error && <EmptyState icon={Clock3} title="Instagram is not connected" description="Check the connection to retrieve the account status and available media." />}
  </div>;
};

export default Instagram;
