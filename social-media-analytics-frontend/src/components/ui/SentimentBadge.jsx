import React from 'react';
import { motion } from 'framer-motion';

const SentimentBadge = ({ sentiment, size = 'sm' }) => {
  const s = sentiment ? sentiment.toLowerCase() : 'unknown';
  let badgeClass = 'badge-neutral';
  
  if (s === 'positive') badgeClass = 'badge-success';
  if (s === 'negative') badgeClass = 'badge-error';
  
  const padding = size === 'sm' ? '0.25rem 0.6rem' : '0.35rem 0.8rem';
  const fontSize = size === 'sm' ? '0.75rem' : '0.875rem';

  return (
    <motion.span 
      className={`badge ${badgeClass}`} 
      style={{ padding, fontSize }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 200 }}
    >
      {sentiment}
    </motion.span>
  );
};

export default SentimentBadge;
