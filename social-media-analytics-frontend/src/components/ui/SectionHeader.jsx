import React from 'react';

const SectionHeader = ({ title, subtitle, action }) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-main)', letterSpacing: '-0.025em' }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', margin: 0 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {action}
        </div>
      )}
    </div>
  );
};

export default SectionHeader;
