import React, { useState, useEffect } from 'react';
import { 
  Settings, Key, Server, Database, CheckCircle, 
  AlertCircle, RefreshCw, ShieldCheck, Cpu, HardDrive 
} from 'lucide-react';

import { getSystemStatus, testMetaConnection, updateCredentials } from '../services/api';
import { formatApiError } from '../utils/apiError';
import MetricCard from '../components/ui/MetricCard';
import SectionHeader from '../components/ui/SectionHeader';

const SettingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  
  // Test Token State
  const [testingToken, setTestingToken] = useState(false);
  const [tokenTestResult, setTokenTestResult] = useState(null);
  const [tokenTestError, setTokenTestError] = useState(null);

  // Form State
  const [metaToken, setMetaToken] = useState('');
  const [pageId, setPageId] = useState('me');
  const [processingEngine, setProcessingEngine] = useState('pandas');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await getSystemStatus();
      setStatus(res.data);
      if (res.data?.backend?.processing_engine) {
        setProcessingEngine(res.data.backend.processing_engine);
      }
      if (res.data?.meta_integration?.facebook_page_id) {
        setPageId(res.data.meta_integration.facebook_page_id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTestToken = async () => {
    setTestingToken(true);
    setTokenTestResult(null);
    setTokenTestError(null);
    try {
      const res = await testMetaConnection();
      setTokenTestResult(res.data);
    } catch (err) {
      setTokenTestError(formatApiError(err, 'Token verification failed'));
    } finally {
      setTestingToken(false);
    }
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);
    try {
      const payload = {
        facebook_page_id: pageId,
        processing_engine: processingEngine
      };
      if (metaToken.trim()) {
        payload.meta_access_token = metaToken.trim();
      }
      const res = await updateCredentials(payload);
      setSaveSuccess(formatApiError(res.data?.message, 'Configuration updated successfully.'));
      setMetaToken('');
      fetchStatus();
    } catch (err) {
      setSaveError(formatApiError(err, 'Could not save Facebook credentials.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      <SectionHeader 
        title="Settings & System Diagnostics" 
        subtitle="Manage Facebook Graph API connectivity, runtime credentials, and processing engine modes (Pandas vs Spark)."
      />

      {saveSuccess && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={16} /> {saveSuccess}
        </div>
      )}
      {saveError && <div role="alert" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', color: 'var(--error)' }}>{saveError}</div>}

      {/* Diagnostics Cards */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <MetricCard 
          title="Processing Layer" 
          value={status?.backend?.processing_engine?.toUpperCase() || 'PANDAS'} 
          icon={Cpu} 
          subtitle="Pipeline engine" 
        />
        <MetricCard 
          title="Trained Models" 
          value={status?.data_storage?.trained_models_count ?? 0} 
          icon={Server} 
          subtitle="Joblib models in registry" 
        />
        <MetricCard 
          title="Persisted Records" 
          value={status?.data_storage?.total_social_records ?? 0} 
          icon={HardDrive} 
          subtitle="SQLite social_feed.db" 
        />
      </div>

      {/* Meta Graph API Credentials Form */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Meta Graph API Configuration</h3>
        <p style={{ margin: '0 0 1.25rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Tokens are sent directly to the backend, encrypted in SQLite, and never returned to the browser. Replacing the user token clears cached Page tokens so they can be acquired again from Facebook.
        </p>

        <form onSubmit={handleSaveCredentials}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Facebook User Access Token (renewed authorization):
            </label>
            <input 
              type="password" 
              placeholder="Paste a fresh User Access Token from your existing Meta app" 
              value={metaToken}
              onChange={(e) => setMetaToken(e.target.value)}
              style={{ width: '100%', fontSize: '0.875rem' }}
            />
          </div>
          <p style={{ margin: '-0.5rem 0 1.25rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Grant <code>pages_show_list</code>, <code>pages_read_engagement</code>, and <code>pages_read_user_content</code>. Page tokens are re-fetched after saving.
          </p>

          <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Facebook Page ID:</label>
              <input 
                type="text" 
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Processing Engine:</label>
              <select 
                value={processingEngine}
                onChange={(e) => setProcessingEngine(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="pandas">Pandas (Local Offline Mode)</option>
                <option value="spark">Apache Spark / Hadoop HDFS</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Updating...' : 'Save Configuration'}
            </button>
            <button type="button" className="btn-secondary" onClick={handleTestToken} disabled={testingToken}>
              <RefreshCw size={15} className={testingToken ? 'animate-spin' : ''} /> 
              {testingToken ? 'Verifying...' : 'Test Meta Token Connectivity'}
            </button>
          </div>
        </form>

        {/* Live Token Test Result */}
        {tokenTestError && (
          <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', backgroundColor: 'var(--error-bg)', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', color: 'var(--error)', fontSize: '0.85rem' }}>
            <AlertCircle size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
            {tokenTestError}
          </div>
        )}

        {tokenTestResult && (
          <div style={{ marginTop: '1.25rem', padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid var(--success)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 600, marginBottom: '0.5rem' }}>
              <CheckCircle size={18} /> {formatApiError(tokenTestResult.message, 'Meta connection verified.')}
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Meta User ID: {tokenTestResult.user?.id}
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>Required Permissions Verification:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', fontSize: '0.8rem' }}>
              {Object.entries(tokenTestResult.required_permissions_check || {}).map(([perm, granted]) => (
                <div key={perm} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ color: granted ? 'var(--success)' : 'var(--error)' }}>
                    {granted ? '✓' : '✗'}
                  </span>
                  <span>{perm}</span>
                </div>
              ))}
            </div>
            {tokenTestResult.connected_pages?.length > 0 && <div style={{ marginTop: '0.85rem', fontSize: '0.8rem' }}>
              <strong>Managed Facebook Pages:</strong>{' '}
              {tokenTestResult.connected_pages.map(page => `${page.page_name} (${page.page_id})${page.page_token_available ? ' · Page token available' : ' · no Page token'}`).join('; ')}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
