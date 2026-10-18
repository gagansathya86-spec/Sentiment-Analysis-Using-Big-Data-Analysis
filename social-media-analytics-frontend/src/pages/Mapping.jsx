import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, AlertCircle, Save } from 'lucide-react';
import { DatasetContext } from '../context/DatasetContext';
import { getDatasetPreview } from '../services/api';

const Mapping = () => {
  const { datasetId, columnMapping, setColumnMapping } = useContext(DatasetContext);
  const navigate = useNavigate();
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [mappingState, setMappingState] = useState({
    text_column: '',
    sentiment_column: '',
    timestamp_column: '',
    likes_column: '',
    comments_column: '',
    shares_column: '',
    user_column: '',
    platform_column: ''
  });

  useEffect(() => {
    if (!datasetId) {
      navigate('/upload');
      return;
    }

    const fetchColumns = async () => {
      try {
        const res = await getDatasetPreview(datasetId);
        setColumns(res.data.columns);
        
        // Initialize with context mapping if available
        if (columnMapping) {
          const initMap = { ...mappingState };
          Object.keys(columnMapping).forEach(key => {
            if (columnMapping[key] !== null && initMap.hasOwnProperty(key)) {
              initMap[key] = columnMapping[key];
            }
          });
          setMappingState(initMap);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchColumns();
  }, [datasetId, columnMapping, navigate]);

  const handleSelectChange = (field, value) => {
    setMappingState(prev => ({
      ...prev,
      [field]: value === '' ? null : value
    }));
  };

  const handleSave = () => {
    // Convert empty strings back to null
    const finalMapping = {};
    Object.keys(mappingState).forEach(key => {
      finalMapping[key] = mappingState[key] || null;
    });
    
    setColumnMapping(finalMapping);
    navigate('/preprocess');
  };

  if (loading) return <div>Loading columns... <span className="loading-spinner" /></div>;

  const mappingFields = [
    { key: 'text_column', label: 'Text/Content (Required)', desc: 'The main social media post content', required: true },
    { key: 'sentiment_column', label: 'Sentiment/Label', desc: 'Ground truth label for training (e.g. positive/negative)' },
    { key: 'timestamp_column', label: 'Timestamp', desc: 'When the post was created' },
    { key: 'user_column', label: 'User/Author', desc: 'The author of the post' },
    { key: 'likes_column', label: 'Likes', desc: 'Number of likes' },
    { key: 'comments_column', label: 'Comments', desc: 'Number of comments' },
    { key: 'shares_column', label: 'Shares', desc: 'Number of shares/retweets' },
    { key: 'platform_column', label: 'Platform', desc: 'Source platform (e.g. Twitter, Facebook)' },
  ];

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Map size={28} color="var(--primary)" />
        Verify Column Mapping
      </h2>
      
      <div style={{ backgroundColor: 'var(--sidebar-active)', color: 'var(--primary)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <AlertCircle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Auto-detection complete</p>
          <p style={{ fontSize: '0.9rem' }}>
            We've automatically mapped your CSV columns based on common naming patterns. 
            Please review and adjust them below to ensure the analytics engine works correctly.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
        {mappingFields.map(field => (
          <div key={field.key} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ flex: '1' }}>
              <div style={{ fontWeight: '500' }}>
                {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{field.desc}</div>
            </div>
            <div style={{ width: '300px' }}>
              <select 
                value={mappingState[field.key] || ''}
                onChange={(e) => handleSelectChange(field.key, e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.5rem', 
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--sidebar-bg)'
                }}
              >
                <option value="">-- Ignore / Not present --</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => navigate('/explorer')}>Back</button>
        <button 
          className="btn-primary" 
          onClick={handleSave}
          disabled={!mappingState.text_column}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Save size={18} />
          Save Mapping & Continue
        </button>
      </div>
    </div>
  );
};

export default Mapping;
