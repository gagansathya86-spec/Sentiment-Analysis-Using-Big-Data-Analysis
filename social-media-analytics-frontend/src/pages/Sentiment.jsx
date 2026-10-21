import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrainCircuit, Play, CheckCircle, AlertTriangle, Send } from 'lucide-react';
import { DatasetContext } from '../context/DatasetContext';
import { trainModel, predictDataset, predictText } from '../services/api';
import { formatApiError } from '../utils/apiError';

const Sentiment = () => {
  const { datasetId, columnMapping, modelMetrics, setModelMetrics } = useContext(DatasetContext);
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [trainResult, setTrainResult] = useState(modelMetrics || null);
  
  const [predicting, setPredicting] = useState(false);
  const [predictResult, setPredictResult] = useState(null);

  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (!datasetId) navigate('/upload');
  }, [datasetId, navigate]);

  const handleTrain = async () => {
    setLoading(true);
    setError(null);
    try {
      const requestBody = {
        mapping: columnMapping,
        test_split_size: 0.2,
        tfidf_max_features: 5000,
        nb_alpha: 1.0
      };
      const res = await trainModel(datasetId, requestBody);
      setTrainResult(res.data);
      setModelMetrics(res.data);
    } catch (err) {
      setError(formatApiError(err, 'Failed to train model. Ensure your dataset has a valid sentiment column.'));
    } finally {
      setLoading(false);
    }
  };

  const handlePredictDataset = async () => {
    setPredicting(true);
    setError(null);
    try {
      const res = await predictDataset(datasetId);
      setPredictResult(res.data);
    } catch (err) {
      setError(formatApiError(err, 'Failed to predict dataset sentiment.'));
    } finally {
      setPredicting(false);
    }
  };

  const handleTestText = async () => {
    if (!testText.trim()) return;
    try {
      const res = await predictText({ datasetId, texts: [testText] });
      setTestResult(res.data.predictions[0]);
    } catch (err) {
      setError(formatApiError(err, 'Failed to predict text.'));
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <BrainCircuit size={28} color="var(--primary)" />
        Sentiment Classification Model
      </h2>
      
      <div className="card">
        <h3 className="card-title">1. Train Model (TF-IDF + Multinomial Naive Bayes)</h3>
        {!trainResult ? (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Train the sentiment classifier using the preprocessed text and the selected sentiment label column.
            </p>
            {error && (
              <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} />
                {error}
              </div>
            )}
            <button 
              className="btn-primary" 
              onClick={handleTrain}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {loading ? <span className="loading-spinner" /> : <Play size={18} />}
              {loading ? 'Training...' : 'Train Sentiment Model'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '1.5rem', fontWeight: '500' }}>
              <CheckCircle size={20} />
              {trainResult.message}
            </div>
            
            <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
              <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Accuracy</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--primary)' }}>
                  {(trainResult.accuracy * 100).toFixed(1)}%
                </div>
              </div>
              <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Macro F1</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                  {(trainResult.macro_avg.f1_score * 100).toFixed(1)}%
                </div>
              </div>
              <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Vocab Size</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                  {trainResult.vocabulary_size.toLocaleString()}
                </div>
              </div>
              <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Test Split</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                  {trainResult.test_rows} rows
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => navigate('/eval')}>View Full Evaluation Matrix</button>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ opacity: trainResult ? 1 : 0.5, pointerEvents: trainResult ? 'auto' : 'none' }}>
        <h3 className="card-title">2. Analyze Dataset Sentiment</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Apply the trained model to predict sentiment for every row in the dataset to build the analytics dashboard.
        </p>
        
        {!predictResult ? (
          <button 
            className="btn-primary" 
            onClick={handlePredictDataset}
            disabled={predicting || !trainResult}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {predicting ? <span className="loading-spinner" /> : <Play size={18} />}
            {predicting ? 'Predicting...' : 'Analyze Dataset Sentiment'}
          </button>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '1.5rem', fontWeight: '500' }}>
              <CheckCircle size={20} />
              {predictResult.message}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              {Object.entries(predictResult.sentiment_distribution).map(([label, count]) => (
                <div key={label} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)', borderLeft: `4px solid ${label === 'positive' ? '#10b981' : label === 'negative' ? '#ef4444' : '#64748b'}` }}>
                  <div style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>{label}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>{count.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to Main Dashboard</button>
          </div>
        )}
      </div>

      <div className="card" style={{ opacity: trainResult ? 1 : 0.5, pointerEvents: trainResult ? 'auto' : 'none' }}>
        <h3 className="card-title">3. Individual Text Analysis (Test the Model)</h3>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input 
            type="text" 
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Type a sample social media post here..."
            style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}
            onKeyDown={(e) => e.key === 'Enter' && handleTestText()}
          />
          <button className="btn-secondary" onClick={handleTestText} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Send size={18} /> Analyze
          </button>
        </div>
        
        {testResult && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)', marginTop: '1rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Prediction: </strong> 
              <span style={{ 
                textTransform: 'uppercase', 
                fontWeight: 'bold',
                color: testResult.predicted_sentiment === 'positive' ? 'var(--success)' : testResult.predicted_sentiment === 'negative' ? 'var(--error)' : 'var(--text-muted)'
              }}>
                {testResult.predicted_sentiment}
              </span>
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Confidence: {(testResult.confidence * 100).toFixed(2)}%
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.875rem' }}>
              {Object.entries(testResult.probabilities).map(([lbl, prob]) => (
                <div key={lbl}>{lbl}: {(prob * 100).toFixed(1)}%</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sentiment;
