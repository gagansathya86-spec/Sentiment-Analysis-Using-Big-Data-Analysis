import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlatform } from '../context/PlatformContext';

const PAGE_TITLES = {
  '/': { title: 'Welcome', subtitle: 'Start your social media analysis' },
  '/dashboard': { title: 'Social Media Intelligence', subtitle: 'Understand audience sentiment, behavior and engagement across your social platforms.' },
  '/facebook': { title: 'Facebook Analytics', subtitle: 'Analyze posts, audience reactions, comments and engagement.' },
  '/instagram': { title: 'Instagram Analytics', subtitle: 'Connect a linked Professional account and analyze accessible media and comments.' },
  '/behavior': { title: 'User Behavior', subtitle: 'Analyze posting frequency and audience activity patterns.' },
  '/sentiment-dashboard': { title: 'Sentiment Analytics', subtitle: 'Detailed breakdown of audience sentiment and trends.' },
  '/trends': { title: 'Trends Analysis', subtitle: 'Monitor social media activity and sentiment over time.' },
  '/eval': { title: 'Model Evaluation', subtitle: 'Performance metrics for the Sentiment Classification Model.' },
  '/insights': { title: 'Automated Insights', subtitle: 'Key takeaways and summaries generated from your data.' },
  '/explorer': { title: 'Data Explorer', subtitle: 'View and manage your dataset.' },
  '/mapping': { title: 'Column Mapping', subtitle: 'Map dataset columns to the analytical engine.' },
  '/preprocess': { title: 'Data Preprocessing', subtitle: 'Clean and prepare text for sentiment analysis.' },
  '/sentiment': { title: 'Sentiment Training', subtitle: 'Train or test the machine learning model.' },
  '/upload': { title: 'Upload Dataset', subtitle: 'Import a new CSV or load the Sentiment140 benchmark.' }
};

const Header = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { platform, setPlatform, instagramStatus } = usePlatform();
  const current = PAGE_TITLES[location.pathname] || { title: 'Dashboard', subtitle: 'Social Media Intelligence Platform' };

  return (
    <header style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '1.5rem 2rem',
      backgroundColor: 'var(--bg-color)',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: 'var(--text-main)', letterSpacing: '-0.025em' }}>
          {current.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
          {current.subtitle}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', color: 'var(--text-muted)', fontSize: '0.68rem' }}>
          Analytics platform
          <select aria-label="Analytics platform" value={platform} onChange={(event) => setPlatform(event.target.value)} style={{ minWidth: '145px', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-sm)', background: 'var(--sidebar-bg)', color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          {platform === 'instagram' && instagramStatus && <span role="status" style={{ color: instagramStatus.connected ? 'var(--success)' : 'var(--warning)' }}>{instagramStatus.connected ? `@${instagramStatus.account.username}` : instagramStatus.status === 'error' ? 'Instagram connection could not be verified' : 'Instagram not connected'}</span>}
        </label>
        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search..." 
            style={{ 
              paddingLeft: '2.5rem', 
              width: '240px', 
              backgroundColor: 'var(--sidebar-bg)', 
              borderColor: 'var(--border-color)',
              borderRadius: '9999px'
            }} 
          />
        </div>
        
        <button style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={20} />
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', paddingLeft: '1.25rem', borderLeft: '1px solid var(--border-color)' }}>
          <div style={{ 
            width: '36px', 
            height: '36px', 
            borderRadius: '50%', 
            backgroundColor: 'var(--primary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'white'
          }}>
            <User size={18} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-main)' }}>{user?.username || 'User'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Project Workspace</div>
          </div>
          <button onClick={() => logout().catch(() => {})} title="Sign out" aria-label="Sign out" style={{ color: 'var(--text-muted)', display: 'flex', padding: 6 }}><LogOut size={17} /></button>
        </div>
      </div>
    </header>
  );
};

export default Header;
