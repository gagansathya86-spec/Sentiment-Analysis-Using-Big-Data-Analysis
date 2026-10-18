import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, ShieldAlert, CheckCircle, Clock, 
  RefreshCw, Sliders, Check, Eye, HelpCircle, AlertOctagon 
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
  
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [threshold, setThreshold] = useState(35.0);
  const [editingThreshold, setEditingThreshold] = useState(35.0);
  
  const [scanning, setScanning] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const [alertsRes, configRes] = await Promise.all([
        getAlerts(statusFilter, platformFilter),
        getAlertConfig()
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setSummary(alertsRes.data.summary);
      setThreshold(configRes.data.negative_spike_threshold_percent || 35.0);
      setEditingThreshold(configRes.data.negative_spike_threshold_percent || 35.0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, platformFilter]);

  const handleStatusChange = async (alertId, newStatus) => {
    try {
      await updateAlertStatus(alertId, newStatus);
      setActionSuccess(`Alert status updated to '${newStatus}'`);
      setTimeout(() => setActionSuccess(null), 3000);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunScan = async () => {
    setScanning(true);
    try {
      await refreshAlerts(threshold);
      setActionSuccess('Fresh crisis scan completed across active feeds.');
      setTimeout(() => setActionSuccess(null), 3000);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const handleSaveThreshold = async (e) => {
    e.preventDefault();
    setSavingThreshold(true);
    try {
      await updateAlertConfig(parseFloat(editingThreshold));
      setThreshold(editingThreshold);
      setActionSuccess(`Crisis threshold updated to ${editingThreshold}%`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      console.error(err);
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
            subtitle="Automated surveillance detecting sudden spikes in negative feedback, severe customer complaints, and controversial topics."
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
          subtitle="Pending investigation" 
        />
        <MetricCard 
          title="Critical Severity" 
          value={summary?.critical_active ?? 0} 
          icon={ShieldAlert} 
          subtitle="Severe spike ratio" 
        />
        <MetricCard 
          title="Spike Threshold" 
          value={`${threshold}%`} 
          icon={Sliders} 
          subtitle="Trigger threshold" 
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
              Triggers a warning alert whenever a post or channel registers negative sentiment exceeding this ratio.
            </p>
          </div>

          <form onSubmit={handleSaveThreshold} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input 
              type="number" 
              min={10} 
              max={90} 
              value={editingThreshold} 
              onChange={(e) => setEditingThreshold(e.target.value)}
              style={{ width: '80px', padding: '0.4rem 0.6rem' }}
            />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>% negative</span>
            <button type="submit" className="btn-secondary" disabled={savingThreshold}>
              {savingThreshold ? 'Saving...' : 'Update Threshold'}
            </button>
          </form>
        </div>
      </div>

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

        {alerts.length === 0 ? (
          <EmptyState 
            icon={CheckCircle}
            title="No Active Alerts"
            description="All social feeds are within normal sentiment parameters, or no incidents match the selected filter."
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

                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Recorded Ratio: <strong style={{ color: 'var(--error)' }}>{alert.negative_ratio}% negative</strong></span>
                    <span>Threshold: {alert.threshold}%</span>
                    <span>Trigger Volume: {alert.affected_volume} complaints</span>
                    <span>Window: {alert.time_window}</span>
                  </div>

                  {/* Evidence Quotes */}
                  {alert.evidence && alert.evidence.length > 0 && (
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.75rem', 
                      backgroundColor: 'rgba(0,0,0,0.3)', 
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                        Incident Evidence Quotes:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {alert.evidence.map((ev, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-main)' }}>
                            • "{ev.text}" <span style={{ color: 'var(--text-muted)' }}>— {ev.author}</span>
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
