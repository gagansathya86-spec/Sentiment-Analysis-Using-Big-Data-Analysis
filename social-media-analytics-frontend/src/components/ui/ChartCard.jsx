import React from 'react';
import { motion } from 'framer-motion';

const ChartCard = ({ title, children, action, height = '300px', index = 0 }) => {
  return (
    <motion.div 
      className="card" 
      style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 + (index * 0.1), ease: "easeOut" }}
    >
      <div className="card-title">
        {title}
        {action && <div>{action}</div>}
      </div>
      <div style={{ height, width: '100%', position: 'relative' }}>
        {children}
      </div>
    </motion.div>
  );
};

export default ChartCard;
