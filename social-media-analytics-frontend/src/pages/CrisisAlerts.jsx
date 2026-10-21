import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, ShieldAlert, CheckCircle, Clock, 
  RefreshCw, Sliders, Check, Eye
} from 'lucide-react';

import { 
  getAlerts, updateAlertStatus, refreshAlerts, 
  getAlertConfig, updateAlertConfig 
} from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import SectionHeader from '../components/ui/SectionHeader';
import EmptyState from '../components/ui/EmptyState';

const CrisisAlerts = () => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  const [alerts, setAlerts] = useState([]);
  const [scans, setScans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [threshold, setThreshold] = useState(35.0);
  const [editingThreshold, setEditingThreshold] = useState(35.0);
  const [minSampleSize, setMinSampleSize] = useState(3);
  const [editingMinSampleSize, setEditingMinSampleSize] = useState(3);
  const [periodDays, setPeriodDays] = useState(7);
  
  const [scanning, setScanning] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);

  const fetchAlerts = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [alertsRes, configRes] = await Promise.all([
        getAlerts(statusFilter, platformFilter),
        getAlertConfig()
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setScans(alertsRes.data.scans || []);
      setSummary(alertsRes.data.summary);
      setThreshold(configRes.data.negative_spike_threshold_percent || 35.0);
      setEditingThreshold(configRes.data.negative_spike_threshold_percent || 35.0);
      setMinSampleSize(configRes.data.min_sample_size || 3);
      setEditingMinSampleSize(configRes.data.min_sample_size || 3);
    } catch (err) {
      console.error(err);
      setLoadError('Could not load crisis alerts or configuration. Check the backend connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, platformFilter]);

  const handleStatusChange = async (alertId, newStatus) => {
    try {
      const alert = alerts.find((item) => item.id === alertId);
      await updateAlertStatus(alertId, newStatus, alert?.platform || platformFilter);
      setActionSuccess(`Alert status updated to '${newStatus}'`);
      setTimeout(() => setActionSuccess(null), 3000);
      fetchAlerts();
    } catch (err) {
      console.error(err);
      setLoadError('The alert status could not be updated. Refresh and try again.');
    }
  };

  const handleRunScan = async () => {
    setScanning(true);
    try {
      const result = await refreshAlerts(threshold, periodDays, platformFilter);
      setScans(result.data.scans || []);
      setActionSuccess('Fresh crisis scan completed across active feeds.');
      setTimeout(() => setActionSuccess(null), 3000);
      fetchAlerts();
    } catch (err) {
      console.error(err);
      setLoadError('The crisis monitoring scan failed. Check the backend connection and try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleSaveThreshold = async (e) => {
    e.preventDefault();
    setSavingThreshold(true);
    try {
      await updateAlertConfig(parseFloat(editingThreshold), parseInt(editingMinSampleSize, 10));
      setThreshold(editingThreshold);
      setMinSampleSize(editingMinSampleSize);
      setActionSuccess(`Alert threshold and minimum sample size updated.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setLoadError('Alert settings could not be saved. Check the threshold and sample size.');
    } finally {
      setSavingThreshold(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Crisis Monitoring & Negative Sentiment Alerts" 
            subtitle="Facebook and Instagram surveillance compares consecutive timestamped periods. Alerts require enough classified items in both periods."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={handleRunScan} disabled={scanning}>
            <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanning Feeds...' : 'Run Crisis Scan'}
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div style={{ 
          padding: '0.75rem 1rem', 
          backgroundColor: 'var(--success-bg)', 
          border: '1px solid var(--success)', 
          borderRadius: 'var(--radius-sm)', 
          color: 'var(--success)', 
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle size={16} /> {actionSuccess}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard 
          title="Active Alerts" 
          value={summary?.active_alerts ?? 0} 
          icon={AlertTriangle} 
          subtitle="Live alerts with traced source evidence" 
        />
        <MetricCard 
          title="Critical Severity" 
          value={summary?.critical_active ?? 0} 
          icon={ShieldAlert} 
          subtitle="Live alerts only; demo/legacy shown below" 
        />
        <MetricCard 
          title="Increase Threshold" 
          value={`${threshold}%`} 
          icon={Sliders} 
          subtitle="Negative percentage-point rise" 
        />
        <MetricCard 
          title="Total Historical" 
          value={summary?.total_alerts ?? 0} 
          icon={Clock} 
          subtitle="Surveillance log" 
        />
      </div>

      {/* Threshold Configuration Drawer / Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h4 style={{ margin: 0 }}>Surveillance Spike Threshold</h4>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Creates a potential-issue alert when negative sentiment rises by this many percentage points over consecutive {periodDays}-day windows. Each period needs at least {minSampleSize} dated posts/comments.
            </p>
          </div>

          <form onSubmit={handleSaveThreshold} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input 
              type="number" 
              min={5} 
              max={95} 
              value={editingThreshold} 
              onChange={(e) => setEditingThreshold(e.target.value)}
              style={{ width: '80px', padding: '0.4rem 0.6rem' }}
            />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>percentage points</span>
            <input type="number" min={3} max={10000} value={editingMinSampleSize} onChange={(e) => setEditingMinSampleSize(e.target.value)} aria-label="Minimum records in each period" style={{ width: '95px', padding: '0.4rem 0.6rem' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>min / period</span>
            <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))} aria-label="Alert comparison period" style={{ fontSize: '0.8rem' }}>
              <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
            </select>
            <button type="submit" className="btn-secondary" disabled={savingThreshold}>
              {savingThreshold ? 'Saving...' : 'Update Threshold'}
            </button>
          </form>
        </div>
      </div>

      {loadError && <div role="alert" style={{ color: 'var(--error)', marginBottom: '1rem' }}>{loadError}</div>}

      {/* Filters & Alerts Feed */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ margin: 0 }}>Incident Feed</h3>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {/* Status Filter */}
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: '0.8rem' }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
            </select>

            {/* Platform Filter */}
            <select 
              value={platformFilter} 
              onChange={(e) => setPlatformFilter(e.target.value)}
              style={{ fontSize: '0.8rem' }}
            >
              <option value="all">All Platforms</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>
        </div>

        {scans.length > 0 && <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
          {scans.filter((scan, index) => scans.findIndex((item) => item.platform === scan.platform) === index).map((scan) => <div key={scan.platform} style={{ color: scan.outcome === 'insufficient_data' ? 'var(--warning)' : 'var(--text-muted)', fontSize: '0.82rem' }}>
            <strong style={{ textTransform: 'capitalize' }}>{scan.platform}:</strong> {scan.outcome === 'insufficient_data' ? 'Insufficient data' : scan.outcome === 'no_risk' ? 'No threshold rise detected' : 'Potential issue detected'} — {scan.reason} Current period {scan.current_period?.start?.slice(0, 10)} to {scan.current_period?.end?.slice(0, 10)} ({scan.current_period?.negative_count ?? '—'}/{scan.current_period?.sample_size ?? '—'} negative); previous {scan.previous_period?.negative_count ?? '—'}/{scan.previous_period?.sample_size ?? '—'}. Stored source coverage: {scan.stored_posts ?? 0} posts, {scan.stored_comments ?? 0} comments; unclassified records are excluded.
          </div>)}
        </div>}

        {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading crisis monitoring records…</div> : alerts.length === 0 ? (
          <EmptyState 
            icon={CheckCircle}
            title={scans.some((scan) => scan.outcome === 'insufficient_data') ? 'Insufficient data' : 'No Active Alerts'}
            description={scans.some((scan) => scan.outcome === 'insufficient_data') ? 'At least three dated, classified items are required in each comparison period. A scan result is not evidence of no risk when data is insufficient.' : 'No supported change met the configured threshold. Review scan outcomes for platforms with insufficient data.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {alerts.map((alert) => {
              const isCritical = alert.severity === 'CRITICAL';
              const borderCol = isCritical ? 'var(--error)' : 'var(--warning)';
              const bgCol = isCritical ? 'rgba(239, 68, 68, 0.05)' : 'rgba(245, 158, 11, 0.05)';

              return (
                <div 
                  key={alert.id}
                  style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${borderCol}`,
                    backgroundColor: bgCol,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className={`badge ${isCritical ? 'badge-error' : 'badge-neutral'}`} style={{ fontWeight: 700 }}>
                        {alert.severity}
                      </span>
                      <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                        {alert.platform}
                      </span>
                      <span className={`badge ${alert.source_type === 'live' ? 'badge-success' : 'badge-neutral'}`}>
                        {alert.source_type === 'demo' ? 'Demo / stale evidence' : alert.source_type === 'live' ? 'Live sourced' : 'Legacy unverified'}
                      </span>
                      <h4 style={{ margin: 0, fontSize: '1rem' }}>{alert.title}</h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge ${alert.status === 'active' ? 'badge-error' : (alert.status === 'resolved' ? 'badge-success' : 'badge-neutral')}`}>
                        Status: {alert.status.toUpperCase()}
                      </span>
                      {alert.status !== 'resolved' && (
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => handleStatusChange(alert.id, 'resolved')}
                        >
                          <Check size={13} /> Resolve
                        </button>
                      )}
                      {alert.status === 'active' && (
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => handleStatusChange(alert.id, 'reviewed')}
                        >
                          <Eye size={13} /> Review
                        </button>
                      )}
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.4 }}>
                    {alert.message}
                  </p>
                  {alert.source_type === 'demo' && <div role="note" style={{ padding: '0.65rem', border: '1px solid var(--warning)', borderRadius: 'var(--radius-sm)', color: 'var(--warning)', fontSize: '0.82rem' }}>This is preserved demo/test evidence from an older seeded record. It is excluded from live alert totals and does not represent a verified incident on the currently connected Page.</div>}
                  {alert.source_type !== 'live' && alert.source_type !== 'demo' && <div role="note" style={{ padding: '0.65rem', border: '1px solid var(--warning)', borderRadius: 'var(--radius-sm)', color: 'var(--warning)', fontSize: '0.82rem' }}>This legacy alert has no verifiable source-record linkage. Treat it as unverified historical data.</div>}

                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                    <span>Current negative ratio: <strong style={{ color: 'var(--error)' }}>{alert.negative_ratio}%</strong></span>
                    <span>{alert.evidence?.current_period ? `Rise threshold: ${alert.threshold} pp` : `Legacy ratio threshold: ${alert.threshold}%`}</span>
                    <span>Trigger Volume: {alert.affected_volume} negative records</span>
                    <span>Window: {alert.time_window}</span>
                    {alert.account_id && <span>Page/account: {alert.account_id}</span>}
                  </div>

                  {/* Evidence Quotes */}
                  {((Array.isArray(alert.evidence) && alert.evidence.length > 0) || alert.evidence?.evidence?.length > 0) && (
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.75rem', 
                      backgroundColor: 'rgba(0,0,0,0.3)', 
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                        Potential issue evidence · compare the prior period and verify against the source:
                      </div>
                      {alert.evidence?.current_period && (
                        <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                          Current: {alert.evidence.current_period.negative_percent}% negative ({alert.evidence.current_period.negative_count}/{alert.evidence.current_period.sample_size}; +{alert.evidence.current_period.positive_count} / -{alert.evidence.current_period.negative_count} / neutral {alert.evidence.current_period.neutral_count}); previous: {alert.evidence.previous_period.negative_percent}% ({alert.evidence.previous_period.negative_count}/{alert.evidence.previous_period.sample_size}); change: {alert.evidence.change_percentage_points > 0 ? '+' : ''}{alert.evidence.change_percentage_points} pp.
                        </div>
                      )}
                      {alert.evidence?.keywords?.length > 0 && <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>Frequent terms in negative examples: {alert.evidence.keywords.map((item) => `${item.keyword} (${item.count})`).join(', ')}</div>}
                      {alert.evidence?.aspects?.length > 0 && <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>Detected aspects in negative examples: {alert.evidence.aspects.map((item) => `${item.aspect} (${item.count})`).join(', ')}</div>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {(Array.isArray(alert.evidence) ? alert.evidence : alert.evidence.evidence || []).map((ev, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-main)' }}>
                            • "{ev.text}" <span style={{ color: 'var(--text-muted)' }}>— {ev.author}{ev.record_type ? ` · ${ev.record_type}` : ''}{ev.post_id ? ` · post ${ev.post_id}` : ''}{ev.time ? ` · ${ev.time}` : ''}{ev.record_id ? ` · record ${ev.record_id}` : ''}</span>{ev.source_url && <a href={ev.source_url} target="_blank" rel="noreferrer" style={{ marginLeft: '0.4rem' }}>View source</a>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CrisisAlerts;
