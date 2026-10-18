import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, File, CheckCircle, AlertTriangle, Database } from 'lucide-react';
import { uploadDataset, uploadSentiment140 } from '../services/api';
import { DatasetContext } from '../context/DatasetContext';
import SectionHeader from '../components/ui/SectionHeader';

const Upload = () => {
  const [sourceType, setSourceType] = useState('custom'); // 'custom' or 'sentiment140'
  const [file, setFile] = useState(null);
  const [sampleSize, setSampleSize] = useState(50000);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { setDatasetId, setFilename, setColumnMapping } = useContext(DatasetContext);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(false);
    }
  };

  const handleUploadCustom = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await uploadDataset(formData);
      setDatasetId(response.data.dataset_id);
      setFilename(response.data.filename);
      setColumnMapping(response.data.detected_mapping);
      setSuccess(true);
      setTimeout(() => navigate('/explorer'), 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload dataset.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSentiment140 = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await uploadSentiment140(sampleSize);
      setDatasetId(response.data.dataset_id);
      setFilename(response.data.filename);
      setColumnMapping(response.data.detected_mapping);
      setSuccess(true);
      setTimeout(() => navigate('/explorer'), 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to prepare Sentiment140 dataset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <SectionHeader 
        title="Import Data" 
        subtitle="Upload your custom CSV data or load the benchmark Sentiment140 dataset."
      />
      
      <div className="card">
        <h2 className="card-title">Select Dataset Source</h2>
        
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button 
            onClick={() => setSourceType('custom')}
            style={{ 
              flex: 1, padding: '1rem', borderRadius: 'var(--radius)', 
              border: `2px solid ${sourceType === 'custom' ? 'var(--primary)' : 'var(--border-color)'}`, 
              backgroundColor: sourceType === 'custom' ? 'var(--sidebar-active)' : 'transparent', 
              color: 'var(--text-main)',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
          >
            Custom CSV Upload
          </button>
          <button 
            onClick={() => setSourceType('sentiment140')}
            style={{ 
              flex: 1, padding: '1rem', borderRadius: 'var(--radius)', 
              border: `2px solid ${sourceType === 'sentiment140' ? 'var(--primary)' : 'var(--border-color)'}`, 
              backgroundColor: sourceType === 'sentiment140' ? 'var(--sidebar-active)' : 'transparent', 
              color: 'var(--text-main)',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
          >
            Sentiment140 Dataset
          </button>
        </div>

        {sourceType === 'custom' ? (
          <>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Please upload a CSV file containing social media posts. The system will automatically detect columns.
            </p>
            <div 
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: 'var(--radius)',
                padding: '3rem 2rem',
                textAlign: 'center',
                backgroundColor: 'var(--sidebar-bg)',
                marginBottom: '1.5rem',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onClick={() => document.getElementById('fileInput').click()}
            >
              <input 
                id="fileInput" 
                type="file" 
                accept=".csv" 
                style={{ display: 'none' }} 
                onChange={handleFileChange}
              />
              
              {file ? (
                <div>
                  <File size={48} style={{ color: 'var(--primary)', margin: '0 auto 1rem' }} />
                  <div style={{ fontWeight: '500', color: 'var(--text-main)' }}>{file.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
              ) : (
                <div>
                  <UploadIcon size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
                  <div style={{ fontWeight: '500', color: 'var(--text-main)' }}>Click to browse or drag and drop</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    CSV files only (Max 50MB)
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn-primary" 
                onClick={handleUploadCustom} 
                disabled={!file || loading || success}
              >
                {loading && <span className="loading-spinner" />}
                {loading ? 'Uploading...' : 'Upload Dataset'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ backgroundColor: 'var(--sidebar-bg)', padding: '1.5rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <Database size={24} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Sentiment140</h3>
              </div>
              <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                <li><strong>Source format:</strong> Twitter sentiment dataset</li>
                <li><strong>Total Records:</strong> 1,600,000 tweets</li>
                <li><strong>Labels:</strong> Positive / Negative (Binary)</li>
                <li><strong>Features:</strong> Text, User, Timestamp, ID</li>
              </ul>
              <p style={{ fontSize: '0.9rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                The original dataset contains 1.6 million tweets. A smaller sample is used for local processing.
              </p>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Select Sample Size</label>
              <select 
                value={sampleSize} 
                onChange={(e) => setSampleSize(Number(e.target.value))}
              >
                <option value={10000}>10,000 records</option>
                <option value={25000}>25,000 records</option>
                <option value={50000}>50,000 records (Default)</option>
                <option value={100000}>100,000 records</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn-primary" 
                onClick={handleUploadSentiment140} 
                disabled={loading || success}
              >
                {loading && <span className="loading-spinner" />}
                {loading ? 'Preparing Sample...' : 'Use Sentiment140 Dataset'}
              </button>
            </div>
          </>
        )}

        {error && (
          <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)', padding: '1rem', borderRadius: 'var(--radius)', marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <AlertTriangle size={20} />
            {error}
          </div>
        )}

        {success && (
          <div style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)', padding: '1rem', borderRadius: 'var(--radius)', marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <CheckCircle size={20} />
            Dataset prepared successfully. Redirecting...
          </div>
        )}
      </div>
    </div>
  );
};

export default Upload;
