import React, { useEffect, useState, useContext } from 'react';
import { 
  CheckCircle, Database, AlertCircle, Play, 
  BarChart2, RefreshCw, Layers, Award, Clock 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer 
} from 'recharts';

import { getRegisteredModels, compareDemoModels, compareModels } from '../services/api';
import { formatApiError } from '../utils/apiError';
import { DatasetContext } from '../context/DatasetContext';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import SectionHeader from '../components/ui/SectionHeader';
import EmptyState from '../components/ui/EmptyState';

const CHART_STYLES = {
  grid: { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false },
  axis: { stroke: 'var(--text-muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: { 
    contentStyle: { backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-main)' }
  }
};

export const ModelEval = () => {
  const { datasetId } = useContext(DatasetContext);
  const [loading, setLoading] = useState(true);
  const [modelsRegistry, setModelsRegistry] = useState({});
  const [activeModel, setActiveModel] = useState(null);
  
  const [benchmarkResult, setBenchmarkResult] = useState(null);
  const [benchmarking, setBenchmarking] = useState(false);
  const [error, setError] = useState(null);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await getRegisteredModels();
      setModelsRegistry(res.data || {});
      const entries = Object.values(res.data || {});
      if (entries.length > 0) {
        // Pick best or latest
        const best = entries.reduce((prev, curr) => 
          (curr.metrics?.train_rows > (prev.metrics?.train_rows || 0)) ? curr : prev
        , entries[0]);
        setActiveModel(best);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runBenchmark = async () => {
    setBenchmarking(true);
    setError(null);
    try {
      let res;
      if (datasetId) {
        try {
          res = await compareModels(datasetId);
        } catch (e) {
          res = await compareDemoModels();
        }
      } else {
        res = await compareDemoModels();
      }
      setBenchmarkResult(res.data);
    } catch (err) {
      setError(formatApiError(err, 'Benchmark comparison failed'));
    } finally {
      setBenchmarking(false);
    }
  };

  useEffect(() => {
    fetchModels();
    runBenchmark();
  }, []);

  const metrics = activeModel?.metrics || {};

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Model Evaluation & Benchmark Comparison" 
            subtitle="Validation of the research paper's TF-IDF + Multinomial Naive Bayes pipeline against Logistic Regression and Linear SVM baselines."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={fetchModels} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh Registry
          </button>
          <button className="btn-primary" onClick={runBenchmark} disabled={benchmarking}>
            <Play size={15} className={benchmarking ? 'animate-spin' : ''} />
            {benchmarking ? 'Evaluating Benchmark...' : 'Run Side-by-Side Benchmark'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--error-bg)', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', color: 'var(--error)', marginBottom: '1.5rem' }}>
          <AlertCircle size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
          {error}
        </div>
      )}

      {/* Primary Model KPIs */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard 
          title="Production Accuracy" 
          value={metrics.accuracy ? `${(metrics.accuracy * 100).toFixed(2)}%` : 'N/A'} 
          icon={CheckCircle} 
          subtitle="Multinomial Naive Bayes" 
        />
        <MetricCard 
          title="Macro F1-Score" 
          value={metrics.macro_avg?.f1_score ? metrics.macro_avg.f1_score.toFixed(4) : 'N/A'} 
          icon={Award} 
          subtitle="Harmonic mean" 
        />
        <MetricCard 
          title="Training Dataset" 
          value={metrics.train_rows ? metrics.train_rows.toLocaleString() : 'N/A'} 
          icon={Database} 
          subtitle="Training rows" 
        />
        <MetricCard 
          title="TF-IDF Vocabulary" 
          value={metrics.vocabulary_size ? metrics.vocabulary_size.toLocaleString() : 'N/A'} 
          icon={Layers} 
          subtitle="Extracted n-grams" 
        />
      </div>

      {/* Side-by-Side Model Benchmark Comparison Table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Empirical Model Comparison Benchmark</h3>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Stratified 80/20 train/test evaluation on identical text features to prevent data leakage.
            </p>
          </div>

          {benchmarkResult && (
            <span className="badge badge-success" style={{ fontSize: '0.8rem' }}>
              Top Performer: {benchmarkResult.best_model_by_f1}
            </span>
          )}
        </div>

        {!benchmarkResult ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            Click 'Run Side-by-Side Benchmark' to compare models.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Algorithm</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Role in Project</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Accuracy</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Macro Precision</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Macro Recall</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Macro F1-Score</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Training Time</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkResult.evaluation_summary?.map((m) => (
                  <tr key={m.model_name} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: m.is_primary_paper_model ? 'rgba(79, 70, 229, 0.05)' : 'transparent' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      {m.model_name}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className={`badge ${m.is_primary_paper_model ? 'badge-primary' : 'badge-neutral'}`} style={{ fontSize: '0.75rem' }}>
                        {m.is_primary_paper_model ? 'Primary Paper Classifier' : 'Benchmark Baseline'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {(m.accuracy * 100).toFixed(2)}%
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{m.macro_precision.toFixed(4)}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{m.macro_recall.toFixed(4)}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--success)' }}>
                      {m.macro_f1.toFixed(4)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                      {m.training_time_sec}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confusion Matrix & Class Breakdown */}
      {metrics.confusion_matrix && (
        <div className="grid-2">
          <div className="card">
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Confusion Matrix</h3>
            <p style={{ margin: '0 0 1.25rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Actual vs Predicted labels on holdout evaluation data.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '350px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {metrics.labels?.map((lbl) => <div key={lbl}>{lbl.toUpperCase()}</div>)}
              </div>
              {metrics.confusion_matrix.map((row, rIdx) => (
                <div key={rIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {row.map((val, cIdx) => (
                    <div 
                      key={cIdx} 
                      style={{ 
                        padding: '1rem', 
                        textAlign: 'center', 
                        fontWeight: 700, 
                        fontSize: '1.1rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: rIdx === cIdx ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                        border: rIdx === cIdx ? '1px solid var(--success)' : '1px solid var(--border-color)'
                      }}
                    >
                      {val}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Class-Level Precision & Recall</h3>
            <p style={{ margin: '0 0 1.25rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Individual performance metrics per sentiment label class.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {metrics.labels?.map((label) => (
                <div key={label} style={{ padding: '0.75rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{label} Class</span>
                    <span className="badge badge-neutral">
                      F1: {metrics.f1_score?.[label]?.toFixed(3) ?? 'N/A'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Precision: <strong style={{ color: 'var(--text-main)' }}>{metrics.precision?.[label]?.toFixed(3) ?? 'N/A'}</strong></span>
                    <span>Recall: <strong style={{ color: 'var(--text-main)' }}>{metrics.recall?.[label]?.toFixed(3) ?? 'N/A'}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelEval;
