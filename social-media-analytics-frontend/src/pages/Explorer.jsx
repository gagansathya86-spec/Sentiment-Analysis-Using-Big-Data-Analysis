import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, AlertCircle, FileText, CheckCircle } from 'lucide-react';
import { DatasetContext } from '../context/DatasetContext';
import { getDatasetPreview, getMissingValues, getDuplicates, getDatasetInfo } from '../services/api';
import { formatApiError } from '../utils/apiError';

const Explorer = () => {
  const { datasetId, filename } = useContext(DatasetContext);
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [preview, setPreview] = useState(null);
  const [missingData, setMissingData] = useState(null);
  const [duplicateData, setDuplicateData] = useState(null);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!datasetId) {
      navigate('/upload');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [prevRes, missRes, dupRes, infoRes] = await Promise.all([
          getDatasetPreview(datasetId),
          getMissingValues(datasetId),
          getDuplicates(datasetId),
          getDatasetInfo(datasetId)
        ]);
        
        setPreview(prevRes.data);
        setMissingData(missRes.data);
        setDuplicateData(dupRes.data);
        setInfo(infoRes.data);
      } catch (err) {
        setError(formatApiError(err, 'Failed to fetch dataset information.'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [datasetId, navigate]);

  if (loading) return <div>Loading dataset information... <span className="loading-spinner" /></div>;
  if (error) return <div className="error-msg">{error}</div>;
  if (!preview) return null;

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Database size={28} color="var(--primary)" />
        Dataset Explorer
      </h2>

      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>File Name</div>
          <div style={{ fontSize: '1.125rem', fontWeight: '500', wordBreak: 'break-all' }}>{filename}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Records</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{preview.total_rows.toLocaleString()}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Columns</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{preview.columns.length}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={20} color="var(--warning)" />
            Missing Values Analysis
          </h3>
          {missingData.rows_with_any_missing === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
              <CheckCircle size={20} />
              No missing values found in the dataset.
            </div>
          ) : (
            <>
              <p style={{ marginBottom: '1rem' }}>
                Found <strong>{missingData.rows_with_any_missing.toLocaleString()}</strong> rows with at least one missing value.
              </p>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Missing Count</th>
                      <th>Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(missingData.missing_by_column)
                      .filter(([_, count]) => count > 0)
                      .map(([col, count]) => (
                      <tr key={col}>
                        <td>{col}</td>
                        <td>{count}</td>
                        <td>{missingData.missing_percent_by_column[col].toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} color="var(--primary)" />
            Duplicate Records Analysis
          </h3>
          {duplicateData.duplicate_rows === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
              <CheckCircle size={20} />
              No duplicate records found in the dataset.
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: '1rem' }}>
                Found <strong>{duplicateData.duplicate_rows.toLocaleString()}</strong> duplicate rows 
                ({duplicateData.duplicate_percent.toFixed(2)}% of dataset).
              </p>
              <p style={{ color: 'var(--text-muted)' }}>
                These will be handled during the preprocessing stage.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Data Preview (First {preview.preview.length} rows)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                {preview.columns.map(col => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.preview.map((row, idx) => (
                <tr key={idx}>
                  {preview.columns.map(col => (
                    <td key={col}>
                      {String(row[col]).length > 50 
                        ? String(row[col]).substring(0, 50) + '...' 
                        : String(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => navigate('/upload')}>Back</button>
        <button className="btn-primary" onClick={() => navigate('/mapping')}>Continue to Column Mapping</button>
      </div>
    </div>
  );
};

export default Explorer;
