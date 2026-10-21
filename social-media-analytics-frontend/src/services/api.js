import axios from 'axios';
import { formatApiError } from '../utils/apiError';

const META_COOLDOWN_KEY = 'projecti.meta.retryAfter';
const requestFlights = new Map();
const responseCache = new Map();

const isMetaEndpoint = (url = '') => /\/(facebook|instagram)\//i.test(url) || url.includes('/api/settings/test-meta');
const metaCooldownMessage = (retryAt = 0) => {
  const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  return `Meta temporarily rate-limited this app. Requests are paused for about ${seconds} seconds. Please retry afterward.`;
};
const saveMetaCooldown = (seconds = 0) => {
  const retryAt = Date.now() + Math.max(1, Number(seconds) || 0) * 1000;
  localStorage.setItem(META_COOLDOWN_KEY, String(retryAt));
  return retryAt;
};

const cacheKey = (url, params = {}) => `${url}?${new URLSearchParams(Object.entries(params).filter(([, value]) => value != null)).toString()}`;
const cachedGet = (url, params = {}, ttlMs = 30000, refresh = false) => {
  const key = cacheKey(url, params);
  const flightParams = { ...params };
  delete flightParams.refresh;
  const flightKey = `GET ${cacheKey(url, flightParams)}`;
  if (refresh) for (const existingKey of responseCache.keys()) if (existingKey.startsWith(`${url}?`)) responseCache.delete(existingKey);
  const cached = responseCache.get(key);
  if (!refresh && cached?.expiresAt > Date.now()) return Promise.resolve(cached.value);
  if (requestFlights.has(flightKey)) return requestFlights.get(flightKey);
  const request = api.get(url, { params }).then((response) => {
    responseCache.set(key, { value: response, expiresAt: Date.now() + ttlMs });
    return response;
  }).finally(() => requestFlights.delete(flightKey));
  requestFlights.set(flightKey, request);
  return request;
};

const dedupedPost = (url, data = null, config = {}) => {
  const key = `POST ${cacheKey(url, config.params || {})}:${JSON.stringify(data)}`;
  if (requestFlights.has(key)) return requestFlights.get(key);
  const request = api.post(url, data, config).finally(() => requestFlights.delete(key));
  requestFlights.set(key, request);
  return request;
};

export const clearRequestCache = (prefix = '') => {
  for (const key of responseCache.keys()) if (!prefix || key.startsWith(prefix)) responseCache.delete(key);
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (isMetaEndpoint(config.url)) {
    const retryAt = Number(localStorage.getItem(META_COOLDOWN_KEY) || 0);
    if (retryAt > Date.now()) {
      const blocked = new Error(metaCooldownMessage(retryAt));
      blocked.metaRateLimited = true;
      blocked.metaRateLimitSource = 'local_cooldown';
      blocked.retryAt = retryAt;
      blocked.config = config;
      return Promise.reject(blocked);
    }
    if (retryAt) localStorage.removeItem(META_COOLDOWN_KEY);
  }
  try {
    const session = JSON.parse(sessionStorage.getItem('nexusintel.auth') || 'null');
    if (session?.token) config.headers.Authorization = `Bearer ${session.token}`;
  } catch {
    sessionStorage.removeItem('nexusintel.auth');
  }
  return config;
});

api.interceptors.response.use((response) => {
  // Comment sync endpoints may return cached comments successfully while
  // reporting that Meta rate-limited the background refresh.
  const sync = response.data?.sync;
  if (sync?.rate_limited) {
    const retryAt = saveMetaCooldown(sync.retry_after_seconds);
    sync.error = metaCooldownMessage(retryAt);
  }
  return response;
}, (error) => {
  const detail = error.response?.data?.detail;
  const nested = typeof detail === 'object' ? detail : {};
  const textDetail = typeof detail === 'string' ? detail : nested.message || '';
  const metaCode = nested.meta_code ?? nested.code ?? error.response?.data?.error?.code;
  const rateLimited = error.response?.status === 429 || Number(metaCode) === 4 || /Meta (?:API )?Error \(4\)|Application request limit reached/i.test(textDetail);
  if (rateLimited && isMetaEndpoint(error.config?.url)) {
    const headerSeconds = Number(error.response?.headers?.['retry-after'] || 0);
    const bodySeconds = Number(nested.retry_after_seconds || error.response?.data?.retry_after_seconds || 0);
    error.metaRateLimitSource = nested.rate_limit_source || error.response?.headers?.['x-projecti-meta-rate-limit-source'] || 'unknown';
    const retryAt = saveMetaCooldown(Math.max(Number.isFinite(headerSeconds) ? headerSeconds : 0, Number.isFinite(bodySeconds) ? bodySeconds : 0));
    error.metaRateLimited = true;
    error.retryAt = retryAt;
    error.message = metaCooldownMessage(retryAt);
    if (error.response?.data) {
      if (error.response.data.detail && typeof error.response.data.detail === 'object') error.response.data.detail.message = error.message;
      else error.response.data.detail = error.message;
    }
  }
  // Facebook Graph API errors can also use HTTP 401 (for example, an expired
  // Meta token). Only clear the Projecti session for our own auth failures.
  const isApplicationAuthFailure = typeof detail === 'string' && (
    detail === 'Authentication required.' ||
    detail.startsWith('Session expired or invalid.')
  );
  if (error.response?.status === 401 && isApplicationAuthFailure && !error.config?.url?.includes('/api/auth/login')) {
    sessionStorage.removeItem('nexusintel.auth');
    window.dispatchEvent(new Event('auth:expired'));
  }
  return Promise.reject(error);
});

// --- Core Big Data Pipeline ---
export const uploadDataset = (formData) => {
  return api.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const uploadSentiment140 = (sampleSize) => {
  return api.post('/api/upload-sentiment140', { sample_size: sampleSize });
};

export const getDatasetPreview = (id) => api.get(`/api/datasets/${id}/preview`);
export const getMissingValues = (id) => api.get(`/api/datasets/${id}/missing-values`);
export const getDuplicates = (id) => api.get(`/api/datasets/${id}/duplicates`);
export const getDatasetInfo = (id) => api.get(`/api/datasets/${id}/info`);

export const preprocessDataset = (id, requestBody) => api.post(`/api/datasets/${id}/preprocess`, requestBody);

export const trainModel = (id, requestBody) => api.post(`/api/sentiment/train/${id}`, requestBody);
export const predictDataset = (id) => api.post(`/api/sentiment/predict-dataset/${id}`);
export const predictText = (requestBody) => api.post(`/api/sentiment/predict-text`, requestBody);
export const getRegisteredModels = () => api.get('/api/sentiment/models');
export const compareModels = (id) => api.post(`/api/sentiment/compare/${id}`);
export const compareDemoModels = () => api.get('/api/sentiment/compare-demo');

export const getDashboard = (id) => api.get(`/api/analytics/${id}/dashboard`);
export const getPostingFrequency = (id) => api.get(`/api/analytics/${id}/posting-frequency`);
export const getActivityTimeOfDay = (id) => api.get(`/api/analytics/${id}/activity-time-of-day`);
export const getEngagement = (id) => api.get(`/api/analytics/${id}/engagement`);
export const getBehaviorSummary = (id) => api.get(`/api/analytics/${id}/behavior-summary`);
export const getSentimentDistribution = (id) => api.get(`/api/analytics/${id}/sentiment-distribution`);
export const getSentimentTrends = (id) => api.get(`/api/analytics/${id}/sentiment-trends`);
export const getKeywords = (id, top_n = 20) => api.get(`/api/analytics/${id}/keywords?top_n=${top_n}`);

// --- Facebook Endpoints ---
export const getFacebookStatus = (refresh = false) => cachedGet('/facebook/status', { refresh }, 60000, refresh);
export const getFacebookPages = (refresh = false) => cachedGet('/facebook/pages', { refresh }, 60000, refresh);
export const getFacebookDashboardAnalytics = (platform = 'facebook') => api.get(`/api/unified/dashboard-analytics?platform=${platform}`);
// Instagram Graph API operations remain backend-only; Meta tokens are never sent to the browser.
export const getInstagramStatus = (refresh = false) => cachedGet('/instagram/status', { refresh }, 60000, refresh);
export const getInstagramAccounts = (refresh = false) => cachedGet('/instagram/accounts', { refresh }, 60000, refresh);
export const selectInstagramAccount = (accountId) => dedupedPost('/instagram/select-account', { account_id: accountId });
export const getInstagramMedia = (limit = 100, after = null, refresh = false) => cachedGet('/instagram/media', { limit, ...(after ? { after } : {}), refresh }, 30000, refresh);
export const syncInstagramMedia = (maxPages = 100) => dedupedPost('/instagram/sync', null, { params: { max_pages: maxPages, refresh: true } }).then((response) => { clearRequestCache('/instagram/media'); return response; });
export const analyzeInstagramMedia = () => dedupedPost('/instagram/analyze').then((response) => { clearRequestCache('/instagram/media'); return response; });
export const getInstagramComments = (mediaId, limit = 100, after = null) => cachedGet(`/instagram/media/${mediaId}/comments`, { limit, ...(after ? { after } : {}) }, 30000);
export const analyzeInstagramComments = (mediaId, limit = 100, after = null) => dedupedPost(`/instagram/media/${mediaId}/comments/analyze`, null, { params: { limit, ...(after ? { after } : {}) } }).then((response) => { clearRequestCache(`/instagram/media/${mediaId}/comments`); return response; });
export const getInstagramMediaInsights = (mediaId, refresh = false) => cachedGet(`/instagram/media/${mediaId}/insights`, { refresh }, 300000, refresh);
export const getInstagramInsights = (refresh = false) => cachedGet('/instagram/insights', { refresh }, 300000, refresh);
export const getApiErrorMessage = (error) => {
  const status = error?.response?.status;
  if (status) {
    const reason = formatApiError(error, error.response.statusText || `HTTP ${status} request failed`);
    return `HTTP ${status}: ${reason}`;
  }
  if (error?.code === 'ERR_NETWORK' || error?.request) {
    return 'The analytics API could not be reached. Check that the backend is running at the configured API URL.';
  }
  return formatApiError(error, 'Unknown request error');
};
export const selectFacebookPage = (pageId, pageName) =>
  dedupedPost('/facebook/select-page', null, { params: { page_id: pageId, ...(pageName ? { page_name: pageName } : {}) } }).then((response) => { clearRequestCache(); return response; });
export const getFacebookPosts = (pageId = null, allowCached = false, refresh = false) =>
  cachedGet('/facebook/posts', { allow_cached: allowCached, ...(pageId ? { page_id: pageId } : {}), refresh }, 30000, refresh);
export const analyzeFacebookPosts = (pageId = null, refresh = true) =>
  dedupedPost('/facebook/analyze', null, { params: { ...(pageId ? { page_id: pageId } : {}), refresh } }).then((response) => { clearRequestCache('/facebook/posts'); return response; });
export const importFacebookAsDataset = () => api.post('/facebook/import-dataset');
export const getFacebookPostComments = (postId, params = {}) => cachedGet(`/facebook/posts/${postId}/comments`, params, 30000);
export const analyzeFacebookPostComments = (postId, params = {}) => dedupedPost(`/facebook/posts/${postId}/comments/analyze`, null, { params }).then((response) => { clearRequestCache(`/facebook/posts/${postId}/comments`); return response; });
export const getFacebookPostInsights = (postId, refresh = false) => cachedGet(`/facebook/posts/${postId}/insights`, { refresh }, 300000, refresh);
export const loadFacebookDemo = () => api.post('/facebook/load-demo');
export const clearFacebookDemo = () => api.post('/facebook/clear-demo');

// --- Facebook Analytics ---
export const getUnifiedStatus = (demoMode = false) => api.get(`/api/unified/status?demo_mode=${demoMode}`);
export const getUnifiedMetrics = (platform = 'all', demoMode = false) => 
  api.get(`/api/unified/metrics?platform=${platform}&demo_mode=${demoMode}`);
export const getUnifiedFeed = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return api.get(`/api/unified/feed?${query}`);
};
export const getUnifiedCharts = (platform = 'all', demoMode = false) => 
  api.get(`/api/unified/charts?platform=${platform}&demo_mode=${demoMode}`);
export const seedSampleData = () => api.post('/api/unified/seed-sample');
export const clearSampleData = () => api.post('/api/unified/clear-sample');
export const getDemoStatus = () => api.get('/api/unified/demo-status');
export const downloadExportCsv = async (platform = 'all') => {
  const { data } = await api.get(`/api/unified/export?platform=${platform}`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `facebook_analytics_${platform}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

// --- Real Hadoop WebHDFS storage ---
export const getHdfsStatus = () => api.get('/api/hdfs/status');
export const getHdfsSummary = () => api.get('/api/hdfs/summary');
export const exportFacebookToHdfs = (includeSample = false) => api.post(`/api/hdfs/export?include_sample=${includeSample}`);

// --- Aspect-Based Sentiment Analysis ---
export const getAspectSummary = (platform = 'all', accountId = 'all') => {
  const params = new URLSearchParams();
  if (platform && platform !== 'all') params.set('platform', platform);
  if (accountId && accountId !== 'all') params.set('account_id', accountId);
  const query = params.toString();
  return api.get(`/api/aspects/summary${query ? `?${query}` : ''}`);
};
export const getAspectConfig = () => api.get('/api/aspects/config');
export const updateAspectConfig = (aspects) => api.post('/api/aspects/config', { aspects });
export const analyzeAspectText = (text, parentSentiment = null) => {
  return api.post('/api/aspects/analyze-text', { text, parent_sentiment: parentSentiment });
};

// --- Engagement Analytics ---
export const getEngagementOverview = (platform = 'all') => {
  const query = platform && platform !== 'all' ? `?platform=${platform}` : '';
  return api.get(`/api/engagement-stats/overview${query}`);
};
export const getEngagementCorrelation = (platform = 'all') => {
  const query = platform && platform !== 'all' ? `?platform=${platform}` : '';
  return api.get(`/api/engagement-stats/sentiment-correlation${query}`);
};
export const getBestPostingTimes = (platform = 'all') => {
  const query = platform && platform !== 'all' ? `?platform=${platform}` : '';
  return api.get(`/api/engagement-stats/best-times${query}`);
};

// --- Viral Post Potential ---
export const getRankedViralPosts = (limit = 20, platform = 'facebook') => api.get(`/api/viral/ranked-posts?limit=${limit}&platform=${platform}`);
export const getFacebookRecommendations = (platform = 'facebook') => api.get(`/api/viral/recommendations?platform=${platform}`);
export const scoreDraftPost = (draftData) => api.post('/api/viral/score-draft', draftData);

// --- Crisis Alerts & Monitoring ---
export const getAlerts = (status = 'all', platform = 'all') => {
  const params = [];
  if (status && status !== 'all') params.push(`status=${status}`);
  if (platform && platform !== 'all') params.push(`platform=${platform}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return api.get(`/api/alerts${query}`);
};
export const updateAlertStatus = (alertId, status, platform = 'facebook') => api.post(`/api/alerts/${alertId}/status`, { status, platform });
export const refreshAlerts = (threshold = null, periodDays = 7, platform = 'all') => {
  const params = new URLSearchParams({ period_days: periodDays });
  if (platform) params.set('platform', platform);
  if (threshold !== null && threshold !== undefined) params.set('threshold', threshold);
  const query = `?${params.toString()}`;
  return api.post(`/api/alerts/refresh${query}`);
};
export const getAlertConfig = () => api.get('/api/alerts/config');
export const updateAlertConfig = (threshold, minVolume = 3) => {
  return api.post('/api/alerts/config', { threshold, min_volume: minVolume });
};

// --- Trend & Keyword Discovery ---
export const getTrendDiscovery = (platform = 'facebook', topN = 25, periodDays = 7) => {
  const query = `?platform=${platform || 'facebook'}&top_n=${topN}&period_days=${periodDays}`;
  return api.get(`/api/trends-discovery/summary${query}`);
};

// --- Settings & Diagnostics ---
export const getSystemStatus = () => api.get('/api/settings/status');
export const testMetaConnection = () => dedupedPost('/api/settings/test-meta').then((response) => { clearRequestCache(); return response; });
export const updateCredentials = (data) => api.post('/api/settings/update-credentials', data).then((response) => { clearRequestCache(); return response; });

export default api;
