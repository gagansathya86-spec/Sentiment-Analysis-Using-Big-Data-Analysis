import React from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';

const parseValue = (val) => {
  if (typeof val === 'number') return { num: val, suffix: '' };
  if (typeof val === 'string') {
    if (val === 'N/A' || isNaN(parseFloat(val))) return null;
    const num = parseFloat(val.replace(/,/g, ''));
    const suffix = val.includes('%') ? '%' : '';
    return { num, suffix };
  }
  return null;
};

const MetricCard = ({ title, value, subtitle, icon: Icon, trend, trendLabel, color = 'var(--primary)', index = 0 }) => {
  const parsed = parseValue(value);
  const CountUpComponent = CountUp.default || CountUp;

  return (
    <motion.div 
      className="card" 
      style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: "easeOut" }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', margin: 0 }}>
          {title}
        </h3>
        {Icon && <Icon size={20} color={color} opacity={0.8} />}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: 'auto' }}>
        <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-main)' }}>
          {parsed !== null ? (
            <CountUpComponent 
              end={parsed.num} 
              suffix={parsed.suffix} 
              separator="," 
              decimals={parsed.num % 1 !== 0 ? 1 : 0} 
              duration={1.5} 
            />
          ) : (
            value
          )}
        </span>
        {trend !== undefined && (
          <span style={{ 
            fontSize: '0.875rem', 
            fontWeight: 500,
            color: trend > 0 ? 'var(--success)' : (trend < 0 ? 'var(--error)' : 'var(--text-muted)')
          }}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      
      {(subtitle || trendLabel) && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: 0 }}>
          {subtitle} {trendLabel && <span style={{ marginLeft: '0.25rem' }}>{trendLabel}</span>}
        </p>
      )}
    </motion.div>
  );
};

export default MetricCard;
