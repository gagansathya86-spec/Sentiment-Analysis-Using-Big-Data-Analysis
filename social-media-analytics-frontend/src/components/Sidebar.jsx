import React, { useContext, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Home, Upload, Database, Map, Settings, 
  BrainCircuit, LineChart, PieChart, LayoutDashboard, 
  TrendingUp, FileText, CheckCircle, MessageSquare
} from 'lucide-react';
import { DatasetContext } from '../context/DatasetContext';

const NavItem = ({ to, icon: Icon, label }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <NavLink 
      to={to}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 1rem',
        borderRadius: 'var(--radius-sm)',
        color: isActive ? 'var(--sidebar-text-hover)' : (isHovered ? 'var(--sidebar-text-hover)' : 'var(--sidebar-text)'),
        backgroundColor: isActive ? 'var(--sidebar-active)' : (isHovered ? 'rgba(255,255,255,0.02)' : 'transparent'),
        textDecoration: 'none',
        fontSize: '0.875rem',
        fontWeight: 500,
        transition: 'all 0.2s',
        marginBottom: '0.25rem',
        position: 'relative'
      })}
    >
      {({ isActive }) => (
        <>
          <motion.div
            animate={{ x: isHovered && !isActive ? 4 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <Icon size={18} />
          </motion.div>
          {label}
        </>
      )}
    </NavLink>
  );
};

const NavGroup = ({ title, children }) => (
  <div style={{ marginBottom: '1.5rem' }}>
    <div style={{ 
      fontSize: '0.75rem', 
      fontWeight: 600, 
      color: 'var(--text-muted)', 
      textTransform: 'uppercase', 
      letterSpacing: '0.05em',
      padding: '0 1rem',
      marginBottom: '0.5rem'
    }}>
      {title}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  </div>
);

const Sidebar = () => {
  const { datasetId, filename } = useContext(DatasetContext);

  return (
    <aside style={{
      width: '260px',
      backgroundColor: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      overflowY: 'auto'
    }}>
      <div style={{ padding: '1.5rem 1.5rem 2rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
          <BrainCircuit size={24} color="var(--primary)" />
          <span style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.025em' }}>Nexus<span style={{ color: 'var(--primary)' }}>Intel</span></span>
        </div>
      </div>
      
      <div style={{ padding: '0 1rem', flex: 1 }}>
        <NavGroup title="Social Intelligence">
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Overview" />
        </NavGroup>

        <NavGroup title="Social Sources">
          <NavItem to="/facebook" icon={MessageSquare} label="Facebook" />
          <NavItem to="/upload" icon={Upload} label="Import Data" />
        </NavGroup>

        <NavGroup title="Analytics">
          <NavItem to="/sentiment-dashboard" icon={PieChart} label="Sentiment" />
          <NavItem to="/behavior" icon={LineChart} label="User Behavior" />
          <NavItem to="/trends" icon={TrendingUp} label="Trends" />
        </NavGroup>

        <NavGroup title="Models & Workflow">
          <NavItem to="/eval" icon={CheckCircle} label="Model Evaluation" />
          <NavItem to="/explorer" icon={Database} label="Data Explorer" />
          <NavItem to="/mapping" icon={Map} label="Mapping & Preprocess" />
          <NavItem to="/sentiment" icon={Settings} label="Training Pipeline" />
        </NavGroup>

        <NavGroup title="Reports">
          <NavItem to="/insights" icon={FileText} label="Insights" />
        </NavGroup>
      </div>

      {datasetId && (
        <div style={{ 
          margin: '1rem', 
          padding: '1rem', 
          backgroundColor: 'rgba(255,255,255,0.03)', 
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Active Dataset</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 500, wordBreak: 'break-all' }}>
            {filename || datasetId.substring(0, 8)}
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
