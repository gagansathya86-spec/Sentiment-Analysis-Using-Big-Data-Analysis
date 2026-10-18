import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  headers: {
    'Content-Type': 'application/json',
  },
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
export const getFacebookStatus = () => api.get('/facebook/status');
export const getFacebookPosts = (useStored = true) => api.get(`/facebook/posts?use_stored_if_offline=${useStored}`);
export const analyzeFacebookPosts = () => api.post('/facebook/analyze');
export const importFacebookAsDataset = () => api.post('/facebook/import-dataset');
export const getFacebookPostComments = (postId) => api.get(`/facebook/posts/${postId}/comments`);
export const analyzeFacebookPostComments = (postId) => api.post(`/facebook/posts/${postId}/comments/analyze`);
export const getFacebookPostInsights = (postId) => api.get(`/facebook/posts/${postId}/insights`);

// --- Instagram Endpoints (New Feature) ---
export const getInstagramStatus = () => api.get('/instagram/status');
export const getInstagramMedia = (useStored = true) => api.get(`/instagram/media?use_stored_if_offline=${useStored}`);
export const analyzeInstagramMedia = () => api.post('/instagram/analyze');
export const getInstagramComments = (mediaId) => api.get(`/instagram/media/${mediaId}/comments`);
export const analyzeInstagramComments = (mediaId) => api.post(`/instagram/media/${mediaId}/comments/analyze`);
export const importInstagramAsDataset = () => api.post('/instagram/import-dataset');

// --- Unified Cross-Platform Analytics ---
export const getUnifiedStatus = () => api.get('/api/unified/status');
export const getUnifiedMetrics = (platform = 'all') => api.get(`/api/unified/metrics?platform=${platform}`);
export const getUnifiedFeed = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return api.get(`/api/unified/feed?${query}`);
};
export const getUnifiedCharts = (platform = 'all') => api.get(`/api/unified/charts?platform=${platform}`);
export const seedSampleData = () => api.post('/api/unified/seed-sample');
export const getExportCsvUrl = (platform = 'all') => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  return `${baseUrl}/api/unified/export?platform=${platform}`;
};

// --- Aspect-Based Sentiment Analysis ---
export const getAspectSummary = (platform = 'all') => {
  const query = platform && platform !== 'all' ? `?platform=${platform}` : '';
  return api.get(`/api/aspects/summary${query}`);
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
export const getRankedViralPosts = (platform = 'all', limit = 20) => {
  const query = platform && platform !== 'all' ? `?platform=${platform}&limit=${limit}` : `?limit=${limit}`;
  return api.get(`/api/viral/ranked-posts${query}`);
};
export const scoreDraftPost = (draftData) => api.post('/api/viral/score-draft', draftData);

// --- Crisis Alerts & Monitoring ---
export const getAlerts = (status = 'all', platform = 'all') => {
  const params = [];
  if (status && status !== 'all') params.push(`status=${status}`);
  if (platform && platform !== 'all') params.push(`platform=${platform}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return api.get(`/api/alerts${query}`);
};
export const updateAlertStatus = (alertId, status) => api.post(`/api/alerts/${alertId}/status`, { status });
export const refreshAlerts = (threshold = null) => {
  const query = threshold ? `?threshold=${threshold}` : '';
  return api.post(`/api/alerts/refresh${query}`);
};
export const getAlertConfig = () => api.get('/api/alerts/config');
export const updateAlertConfig = (threshold, minVolume = 3) => {
  return api.post('/api/alerts/config', { threshold, min_volume: minVolume });
};

// --- Trend & Keyword Discovery ---
export const getTrendDiscovery = (platform = 'all', topN = 25) => {
  const query = platform && platform !== 'all' ? `?platform=${platform}&top_n=${topN}` : `?top_n=${topN}`;
  return api.get(`/api/trends-discovery/summary${query}`);
};

// --- Settings & Diagnostics ---
export const getSystemStatus = () => api.get('/api/settings/status');
export const testMetaConnection = () => api.post('/api/settings/test-meta');
export const updateCredentials = (data) => api.post('/api/settings/update-credentials', data);

export default api;
