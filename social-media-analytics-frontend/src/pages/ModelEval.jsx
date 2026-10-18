import React, { useContext } from 'react';
import { Target, Search, BarChart2, Hash } from 'lucide-react';
import { DatasetContext } from '../context/DatasetContext';
import { useNavigate } from 'react-router-dom';
import MetricCard from '../components/ui/MetricCard';
import SectionHeader from '../components/ui/SectionHeader';
import DataTable from '../components/ui/DataTable';

export const ModelEval = () => {
  const { datasetId, modelMetrics } = useContext(DatasetContext);
  const navigate = useNavigate();

  if (!datasetId) {
    return (
      <div>
        <SectionHeader title="Model Evaluation" subtitle="View performance metrics for the NLP model." />
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>No Dataset Active</h2>
          <p style={{ color: 'var(--text-muted)' }}>Please upload a dataset first.</p>
          <button className="btn-primary" onClick={() => navigate('/upload')} style={{ marginTop: '1rem' }}>Go to Upload</button>
        </div>
      </div>
    );
  }

  if (!modelMetrics) {
    return (
      <div>
        <SectionHeader title="Model Evaluation" subtitle="View performance metrics for the NLP model." />
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Model Not Trained</h2>
          <p style={{ color: 'var(--text-muted)' }}>Please train the model on the Sentiment page to view metrics.</p>
          <button className="btn-primary" onClick={() => navigate('/sentiment')} style={{ marginTop: '1rem' }}>Go to Sentiment Model</button>
        </div>
      </div>
    );
  }

  const { accuracy, precision, recall, f1_score, confusion_matrix, labels, vocabulary_size, test_rows, train_rows } = modelMetrics;

  const classColumns = [
    { header: 'Class', accessor: 'class', cell: row => <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{row.class}</span> },
    { header: 'Precision', cell: row => `${(row.precision * 100).toFixed(1)}%` },
    { header: 'Recall', cell: row => `${(row.recall * 100).toFixed(1)}%` },
    { header: 'F1-Score', cell: row => `${(row.f1 * 100).toFixed(1)}%` }
  ];

  const classData = labels.map(lbl => ({
    class: lbl,
    precision: precision[lbl],
    recall: recall[lbl],
    f1: f1_score[lbl]
  }));

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <SectionHeader 
        title="Model Evaluation Metrics" 
        subtitle="Performance analysis of the TF-IDF + Multinomial Naive Bayes sentiment classifier."
      />
      
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Algorithm</div>
          <div style={{ fontWeight: 500 }}>TF-IDF + Multinomial NB</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Training Rows</div>
          <div style={{ fontWeight: 500 }}>{train_rows.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Testing Rows</div>
          <div style={{ fontWeight: 500 }}>{test_rows.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Vocabulary Size</div>
          <div style={{ fontWeight: 500 }}>{vocabulary_size.toLocaleString()} terms</div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: '2rem' }}>
        <MetricCard title="Accuracy" value={`${(accuracy * 100).toFixed(1)}%`} icon={Target} color="var(--primary)" />
        <MetricCard title="Macro Precision" value={`${(modelMetrics.macro_avg.precision * 100).toFixed(1)}%`} icon={Search} color="var(--success)" />
        <MetricCard title="Macro Recall" value={`${(modelMetrics.macro_avg.recall * 100).toFixed(1)}%`} icon={BarChart2} color="#8b5cf6" />
        <MetricCard title="Macro F1-Score" value={`${(modelMetrics.macro_avg.f1_score * 100).toFixed(1)}%`} icon={Hash} color="#f59e0b" />
      </div>

      <div className="grid-2">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Class Breakdown</h3>
          </div>
          <DataTable columns={classColumns} data={classData} keyField="class" />
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Confusion Matrix</h3>
          </div>
          <div style={{ padding: '1.5rem', overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: 'none' }}></th>
                  <th colSpan={labels.length} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', paddingBottom: '0.5rem' }}>Predicted</th>
                </tr>
                <tr>
                  <th style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'left', padding: '0.5rem' }}>Actual</th>
                  {labels.map(lbl => (
                    <th key={lbl} style={{ textTransform: 'capitalize', textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>{lbl}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labels.map((actualLbl, i) => (
                  <tr key={actualLbl}>
                    <td style={{ fontWeight: '500', textTransform: 'capitalize', padding: '0.5rem', borderRight: '1px solid var(--border-color)' }}>{actualLbl}</td>
                    {labels.map((predLbl, j) => (
                      <td key={predLbl} style={{ 
                        textAlign: 'center', 
                        fontSize: '1.125rem',
                        fontWeight: i === j ? 'bold' : 'normal',
                        padding: '1rem',
                        backgroundColor: i === j ? 'var(--success-bg)' : (confusion_matrix[i][j] > 0 ? 'var(--error-bg)' : 'transparent'),
                        color: i === j ? 'var(--success)' : (confusion_matrix[i][j] > 0 ? 'var(--error)' : 'var(--text-muted)')
                      }}>
                        {confusion_matrix[i][j]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
