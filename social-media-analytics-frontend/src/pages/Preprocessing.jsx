import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, CheckCircle, Play, AlertTriangle } from 'lucide-react';
import { DatasetContext } from '../context/DatasetContext';
import { preprocessDataset } from '../services/api';

const Preprocessing = () => {
  const { datasetId, columnMapping } = useContext(DatasetContext);
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [options, setOptions] = useState({
    remove_urls: true,
    remove_mentions: true,
    remove_special_chars: true,
    remove_numbers: true,
    remove_emojis: true,
    lowercase: true,
    remove_stopwords: true,
    apply_stemming: true,
    drop_duplicates: true,
    drop_missing_text: true
  });

  useEffect(() => {
    if (!datasetId) navigate('/upload');
  }, [datasetId, navigate]);

  const handleToggle = (key) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const runPipeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const requestBody = {
        mapping: columnMapping,
        ...options
      };
      const res = await preprocessDataset(datasetId, requestBody);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'An error occurred during preprocessing.');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { key: 'drop_missing_text', label: 'Handle Missing Values' },
    { key: 'drop_duplicates', label: 'Remove Duplicates' },
    { key: 'remove_urls', label: 'Remove URLs' },
    { key: 'remove_mentions', label: 'Remove Mentions (@)' },
    { key: 'remove_emojis', label: 'Remove Emojis' },
    { key: 'remove_numbers', label: 'Remove Numbers' },
    { key: 'remove_special_chars', label: 'Remove Special Chars / Punctuation' },
    { key: 'lowercase', label: 'Convert to Lowercase' },
    { key: 'remove_stopwords', label: 'Remove Stopwords (NLTK)' },
    { key: 'apply_stemming', label: 'Apply Stemming (Porter)' },
  ];

  return (
    <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Settings size={28} color="var(--primary)" />
        NLP Preprocessing Pipeline
      </h2>
      
      {!result ? (
        <>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Configure the Natural Language Processing steps to clean the social media text before training the sentiment model.
          </p>

          <div className="grid-2" style={{ marginBottom: '2rem' }}>
            {steps.map(step => (
              <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)' }}>
                <input 
                  type="checkbox" 
                  id={step.key}
                  checked={options[step.key]}
                  onChange={() => handleToggle(step.key)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor={step.key} style={{ cursor: 'pointer', flex: 1, userSelect: 'none' }}>
                  {step.label}
                </label>
              </div>
            ))}
          </div>

          {error && (
            <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={20} />
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn-secondary" onClick={() => navigate('/mapping')} disabled={loading}>Back</button>
            <button 
              className="btn-primary" 
              onClick={runPipeline}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem' }}
            >
              {loading ? <span className="loading-spinner" /> : <Play size={18} />}
              {loading ? 'Processing Dataset...' : 'Run Preprocessing Pipeline'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={24} />
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{result.message}</div>
          </div>

          <div className="grid-4" style={{ marginBottom: '2rem' }}>
            <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Rows Before</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{result.rows_before.toLocaleString()}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Rows After</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--primary)' }}>{result.rows_after.toLocaleString()}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Duplicates Removed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{result.duplicates_removed.toLocaleString()}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Missing Text Removed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{result.missing_removed.toLocaleString()}</div>
            </div>
          </div>

          <h3 style={{ marginBottom: '1rem' }}>Sample Processed Text</h3>
          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Original Text (Snippet)</th>
                  <th>Processed Text</th>
                </tr>
              </thead>
              <tbody>
                {result.sample_processed.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {String(row[columnMapping.text_column]).substring(0, 80)}...
                    </td>
                    <td style={{ color: 'var(--primary)', fontWeight: '500' }}>
                      {row.processed_text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={() => navigate('/sentiment')}>Continue to Sentiment Model</button>
          </div>
        </>
      )}
    </div>
  );
};

export default Preprocessing;
