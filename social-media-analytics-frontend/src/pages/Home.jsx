import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Cog, BarChart, Server, Layers } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--primary)' }}>
          SocialSentiment Analytics
        </h1>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
          Big Data Based Social Media Sentiment Analysis & User Behavior Mining
        </h2>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3 className="card-title">Research Objectives</h3>
        <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.8' }}>
          <li>Analyze social media user behavior and opinions using Big Data analytics techniques.</li>
          <li>Apply data mining and Natural Language Processing methods to perform sentiment analysis on social media data.</li>
          <li>Identify sentiment patterns and trends from large-scale social media data to support better decision-making.</li>
        </ul>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3 className="card-title">Analysis Pipeline</h3>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: '#f8fafc',
          padding: '2rem',
          borderRadius: 'var(--radius)',
          fontFamily: 'monospace'
        }}>
          <div>Social Media Dataset</div>
          <div>↓</div>
          <div>Data Preprocessing</div>
          <div>↓</div>
          <div style={{ color: '#0ea5e9' }}>Hadoop / HDFS (Storage)</div>
          <div>↓</div>
          <div style={{ color: '#0ea5e9' }}>Apache Spark (Processing Engine)</div>
          <div>↓</div>
          <div>User Behavior Mining &nbsp; + &nbsp; NLP</div>
          <div>↓</div>
          <div>TF-IDF Feature Extraction</div>
          <div>↓</div>
          <div>Multinomial Naive Bayes Model</div>
          <div>↓</div>
          <div>Sentiment Classification</div>
          <div>↓</div>
          <div>Visualization & Decision Insights</div>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Note: This deployment uses Pandas local processing mode for demonstration. Spark/HDFS mode is supported via backend configuration.
        </p>
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h3 className="card-title">Technology Stack</h3>
        <div className="grid-4" style={{ textAlign: 'center' }}>
          <div style={{ padding: '1rem', backgroundColor: '#f1f5f9', borderRadius: 'var(--radius)' }}>
            <Server size={32} style={{ margin: '0 auto 0.5rem', color: 'var(--primary)' }} />
            <div>FastAPI (Python)</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f1f5f9', borderRadius: 'var(--radius)' }}>
            <Cog size={32} style={{ margin: '0 auto 0.5rem', color: 'var(--primary)' }} />
            <div>Scikit-Learn (TF-IDF & NB)</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f1f5f9', borderRadius: 'var(--radius)' }}>
            <Database size={32} style={{ margin: '0 auto 0.5rem', color: 'var(--primary)' }} />
            <div>Pandas / Spark</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f1f5f9', borderRadius: 'var(--radius)' }}>
            <BarChart size={32} style={{ margin: '0 auto 0.5rem', color: 'var(--primary)' }} />
            <div>React + Recharts</div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button 
          className="btn-primary" 
          style={{ padding: '1rem 2rem', fontSize: '1.2rem' }}
          onClick={() => navigate('/upload')}
        >
          Start Analysis Pipeline
        </button>
      </div>
    </div>
  );
};

export default Home;
