import React, { useState, useEffect } from 'react';
import { 
  FileText, Download, Printer, Filter, Search, 
  Layers, CheckCircle, BarChart2, ShieldAlert, Sparkles 
} from 'lucide-react';

import { 
  getUnifiedMetrics, getUnifiedFeed, getExportCsvUrl, 
  getAspectSummary, getAlerts 
} from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import SectionHeader from '../components/ui/SectionHeader';
import SentimentBadge from '../components/ui/SentimentBadge';

export const Reports = () => {
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  
  const [metrics, setMetrics] = useState(null);
  const [aspects, setAspects] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sampleFeed, setSampleFeed] = useState([]);

  useEffect(() => {
    const fetchReportData = async () => {
      setLoading(true);
      try {
        const [metRes, aspRes, alRes, feedRes] = await Promise.all([
          getUnifiedMetrics(platform),
          getAspectSummary(platform),
          getAlerts('all', platform),
          getUnifiedFeed({ platform, limit: 10 })
        ]);
        setMetrics(metRes.data);
        setAspects(aspRes.data.aspects || []);
        setAlerts(alRes.data.alerts || []);
        setSampleFeed(feedRes.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReportData();
  }, [platform]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Analytical Reports & Executive Dossier" 
            subtitle="Comprehensive synthesis of multi-platform audience sentiment, brand perception, critical incidents, and engagement dynamics."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select 
            value={platform} 
            onChange={(e) => setPlatform(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          >
            <option value="all">All Channels</option>
            <option value="facebook">Facebook Only</option>
            <option value="instagram">Instagram Only</option>
          </select>

          <a 
            href={getExportCsvUrl(platform)} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn-secondary"
            style={{ textDecoration: 'none' }}
          >
            <Download size={15} /> Download CSV
          </a>

          <button className="btn-primary" onClick={handlePrint}>
            <Printer size={15} /> Print / Save PDF Dossier
          </button>
        </div>
      </div>

      {/* Printable Report Document */}
      <div className="card" style={{ padding: '2.5rem', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: 'var(--radius)' }}>
        {/* Dossier Header */}
        <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#1e293b' }}>
              Executive Sentiment & Behavior Dossier
            </h1>
            <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '0.25rem' }}>
              Project: Sentiment Analysis Using Big Data Analysis & Social Intelligence
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4f46e5' }}>CONFIDENTIAL REPORT</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
              Generated: {new Date().toLocaleDateString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Scope: {platform.toUpperCase()}</div>
          </div>
        </div>

        {/* Executive Summary */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#0f172a' }}>
            1. Executive Summary
          </h3>
          <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#334155' }}>
            Across {metrics?.total_records || 0} monitored social media records, net public sentiment is currently 
            <strong> {metrics?.percentages.positive || 0}% Positive</strong>, 
            <strong> {metrics?.percentages.negative || 0}% Negative</strong>, and 
            <strong> {metrics?.percentages.neutral || 0}% Neutral</strong>. 
            The dataset captures active engagement across Facebook and Instagram platforms, evaluated through a 
            fully offline Scikit-Learn TF-IDF + Multinomial Naive Bayes model.
          </p>
        </div>

        {/* Key Metrics Table */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: '#0f172a' }}>
            2. Core Intelligence Key Performance Indicators
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', textAlign: 'center' }}>
            <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>TOTAL RECORDS</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {metrics?.total_records || 0}
              </div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>POSITIVE RATE</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d', marginTop: '0.25rem' }}>
                {metrics?.percentages.positive || 0}%
              </div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>NEGATIVE RATE</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b91c1c', marginTop: '0.25rem' }}>
                {metrics?.percentages.negative || 0}%
              </div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>AVG ENGAGEMENT</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5', marginTop: '0.25rem' }}>
                {metrics?.engagement.average_engagement_per_post || 0}
              </div>
            </div>
          </div>
        </div>

        {/* Aspect Analysis Breakdown */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: '#0f172a' }}>
            3. Commercial Aspect Breakdown (ABSA)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '0.5rem 0.75rem' }}>Aspect Dimension</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Mentions</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Positive</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Negative</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Net Perception Score</th>
              </tr>
            </thead>
            <tbody>
              {aspects.map(a => (
                <tr key={a.key} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{a.total_mentions}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#15803d' }}>{a.positive_count}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#b91c1c' }}>{a.negative_count}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: a.sentiment_score >= 0 ? '#15803d' : '#b91c1c' }}>
                    {a.sentiment_score > 0 ? `+${a.sentiment_score}` : a.sentiment_score}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Crisis Incidents Summary */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: '#0f172a' }}>
            4. Negative Sentiment Spike Incidents
          </h3>
          {alerts.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>No negative sentiment spikes exceeding thresholds.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alerts.slice(0, 3).map(al => (
                <div key={al.id} style={{ padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.85rem' }}>
                    <span>[{al.severity}] {al.title}</span>
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Status: {al.status.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.2rem' }}>{al.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Methodology Sign-Off */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
          <div>Engine: Scikit-Learn TF-IDF + Multinomial Naive Bayes | Meta Graph API</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
