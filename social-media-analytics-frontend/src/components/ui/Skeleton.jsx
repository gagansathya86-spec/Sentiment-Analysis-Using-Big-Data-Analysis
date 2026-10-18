import React from 'react';
import { motion } from 'framer-motion';

const Skeleton = ({ width = '100%', height = '20px', borderRadius = 'var(--radius-sm)', style = {} }) => {
  return (
    <motion.div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--sidebar-bg) 25%, var(--border-color) 50%, var(--sidebar-bg) 75%)',
        backgroundSize: '200% 100%',
        ...style
      }}
      animate={{
        backgroundPosition: ['100% 0', '-100% 0'],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
};

export const CardSkeleton = () => (
  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
    <Skeleton width="40%" height="24px" />
    <Skeleton width="100%" height="150px" borderRadius="var(--radius)" style={{ flex: 1 }} />
  </div>
);

export const MetricSkeleton = () => (
  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
    <Skeleton width="48px" height="48px" borderRadius="50%" />
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
      <Skeleton width="60%" height="16px" />
      <Skeleton width="80%" height="28px" />
    </div>
  </div>
);

export const PageSkeleton = ({ type = 'dashboard' }) => {
  if (type === 'dashboard') {
    return (
      <div>
        <div style={{ marginBottom: '2rem' }}>
          <Skeleton width="250px" height="32px" style={{ marginBottom: '0.5rem' }} />
          <Skeleton width="400px" height="20px" />
        </div>
        <div className="grid-4" style={{ marginBottom: '2rem' }}>
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
        </div>
        <div className="grid-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  // Generic fallback
  return (
    <div style={{ padding: '2rem' }}>
      <Skeleton width="200px" height="32px" style={{ marginBottom: '2rem' }} />
      <CardSkeleton />
    </div>
  );
};

export default Skeleton;
