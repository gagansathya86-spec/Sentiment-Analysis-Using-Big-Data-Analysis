import React from 'react';
import { Database } from 'lucide-react';

const EmptyState = ({ icon: Icon = Database, title = 'No Data', description = 'No data is currently available.' }) => {
  return (
    <div style={{ 
      padding: '4rem 2rem', 
      textAlign: 'center', 
      backgroundColor: 'rgba(0,0,0,0.1)', 
      borderRadius: 'var(--radius)', 
      color: 'var(--text-muted)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px dashed var(--border-color)'
    }}>
      <Icon size={48} color="var(--border-color)" style={{ marginBottom: '1.5rem' }} />
      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '1.125rem', fontWeight: 500 }}>{title}</h3>
      <p style={{ margin: 0, maxWidth: '400px' }}>{description}</p>
    </div>
  );
};

export default EmptyState;
