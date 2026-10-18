import React, { useContext, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  BrainCircuit, LayoutDashboard, Layers, MessageSquare, 
  Upload, Sparkles, Heart, Zap, AlertTriangle, 
  TrendingUp, PieChart, LineChart, CheckCircle, Database, 
  Map, Settings, FileText, Sliders 
} from 'lucide-react';
import { InstagramIcon as Instagram } from './BrandIcons';
import { DatasetContext } from '../context/DatasetContext';

const NavItem = ({ to, icon: Icon, label, badge = null }) => {
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
        padding: '0.55rem 0.9rem',
        borderRadius: 'var(--radius-sm)',
        color: isActive ? 'var(--sidebar-text-hover)' : (isHovered ? 'var(--sidebar-text-hover)' : 'var(--sidebar-text)'),
        backgroundColor: isActive ? 'var(--sidebar-active)' : (isHovered ? 'rgba(255,255,255,0.02)' : 'transparent'),
        textDecoration: 'none',
        fontSize: '0.84rem',
        fontWeight: 500,
        transition: 'all 0.15s',
        marginBottom: '0.2rem',
        position: 'relative'
      })}
    >
      {({ isActive }) => (
        <>
          <motion.div
            animate={{ x: isHovered && !isActive ? 3 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <Icon size={17} />
          </motion.div>
          <span style={{ flex: 1 }}>{label}</span>
          {badge && (
            <span style={{ 
              fontSize: '0.65rem', 
              padding: '0.1rem 0.4rem', 
              borderRadius: '4px', 
              backgroundColor: 'rgba(79, 70, 229, 0.2)', 
              color: 'var(--primary)' 
            }}>
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
};

const NavGroup = ({ title, children }) => (
  <div style={{ marginBottom: '1.25rem' }}>
    <div style={{ 
      fontSize: '0.7rem', 
      fontWeight: 700, 
      color: 'var(--text-muted)', 
      textTransform: 'uppercase', 
      letterSpacing: '0.06em',
      padding: '0 0.9rem',
      marginBottom: '0.4rem'
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
      <div style={{ padding: '1.25rem 1.25rem 1.5rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
          <BrainCircuit size={24} color="var(--primary)" />
          <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.025em' }}>
            Nexus<span style={{ color: 'var(--primary)' }}>Intel</span>
          </span>
          <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', borderRadius: '4px', fontWeight: 600 }}>
            v2.0
          </span>
        </div>
      </div>
      
      <div style={{ padding: '0 0.75rem', flex: 1 }}>
        <NavGroup title="Social Intelligence">
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Command Center" />
          <NavItem to="/unified" icon={Layers} label="Unified Analytics" badge="Multi" />
        </NavGroup>

        <NavGroup title="Data Sources">
          <NavItem to="/facebook" icon={MessageSquare} label="Facebook Graph" />
          <NavItem to="/instagram" icon={Instagram} label="Instagram Business" badge="New" />
          <NavItem to="/upload" icon={Upload} label="Import & Datasets" />
        </NavGroup>

        <NavGroup title="Advanced Analytics">
          <NavItem to="/aspects" icon={Sparkles} label="Aspect-Based ABSA" badge="New" />
          <NavItem to="/engagement-analytics" icon={Heart} label="Engagement Dynamics" />
          <NavItem to="/viral-potential" icon={Zap} label="Viral Potential" />
          <NavItem to="/alerts" icon={AlertTriangle} label="Crisis Alerts" />
          <NavItem to="/trends" icon={TrendingUp} label="Trends & Keywords" />
          <NavItem to="/sentiment-dashboard" icon={PieChart} label="Sentiment Deep-Dive" />
          <NavItem to="/behavior" icon={LineChart} label="User Behavior Mining" />
        </NavGroup>

        <NavGroup title="Models & Big Data">
          <NavItem to="/eval" icon={CheckCircle} label="Model Benchmark" />
          <NavItem to="/sentiment" icon={Settings} label="Training Pipeline" />
          <NavItem to="/explorer" icon={Database} label="Data Explorer" />
          <NavItem to="/mapping" icon={Map} label="Mapping & Preprocess" />
        </NavGroup>

        <NavGroup title="Administration">
          <NavItem to="/reports" icon={FileText} label="Executive Dossier" />
          <NavItem to="/settings" icon={Sliders} label="API Status & Engine" />
        </NavGroup>
      </div>

      {datasetId && (
        <div style={{ 
          margin: '0.75rem', 
          padding: '0.75rem 0.9rem', 
          backgroundColor: 'rgba(255,255,255,0.03)', 
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
            Active Dataset
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500, wordBreak: 'break-all' }}>
            {filename || datasetId.substring(0, 8)}
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
