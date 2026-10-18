import React from 'react';
import SectionHeader from '../components/ui/SectionHeader';
import { Lightbulb, Download } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';

export const Insights = () => {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <SectionHeader 
        title="Automated Insights" 
        subtitle="AI-generated takeaways from your social data (Coming Soon)."
      />
      
      <div className="card">
        <EmptyState 
          icon={Lightbulb}
          title="Insights Engine"
          description="The insights engine will analyze your data in the background and present key findings here once enough historical data is gathered."
        />
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Export Report</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Generate a comprehensive PDF or CSV report of the current dataset.</p>
          </div>
          <button className="btn-secondary" disabled>
            <Download size={16} /> Export
          </button>
        </div>
      </div>
    </div>
  );
};

export const PlaceholderPages = { Insights };
