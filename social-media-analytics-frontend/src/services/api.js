import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

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

export const getDashboard = (id) => api.get(`/api/analytics/${id}/dashboard`);
export const getPostingFrequency = (id) => api.get(`/api/analytics/${id}/posting-frequency`);
export const getActivityTimeOfDay = (id) => api.get(`/api/analytics/${id}/activity-time-of-day`);
export const getEngagement = (id) => api.get(`/api/analytics/${id}/engagement`);
export const getBehaviorSummary = (id) => api.get(`/api/analytics/${id}/behavior-summary`);
export const getSentimentDistribution = (id) => api.get(`/api/analytics/${id}/sentiment-distribution`);
export const getSentimentTrends = (id) => api.get(`/api/analytics/${id}/sentiment-trends`);
export const getKeywords = (id, top_n = 20) => api.get(`/api/analytics/${id}/keywords?top_n=${top_n}`);

// Facebook Endpoints
export const analyzeFacebookPosts = () => api.post('/facebook/analyze');
export const importFacebookAsDataset = () => api.post('/facebook/import-dataset');
export const getFacebookPostComments = (postId) => api.get(`/facebook/posts/${postId}/comments`);
export const analyzeFacebookPostComments = (postId) => api.post(`/facebook/posts/${postId}/comments/analyze`);
export const getFacebookPostInsights = (postId) => api.get(`/facebook/posts/${postId}/insights`);

export default api;
