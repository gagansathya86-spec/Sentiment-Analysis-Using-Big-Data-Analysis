import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getInstagramStatus } from '../services/api';
import { formatApiError } from '../utils/apiError';

const PlatformContext = createContext(null);

export const PlatformProvider = ({ children }) => {
  const [platform, setPlatformState] = useState(() => localStorage.getItem('analytics-platform') === 'instagram' ? 'instagram' : 'facebook');
  const [instagramStatus, setInstagramStatus] = useState(null);
  const setPlatform = (next) => {
    const normalized = next === 'instagram' ? 'instagram' : 'facebook';
    localStorage.setItem('analytics-platform', normalized);
    setPlatformState(normalized);
  };

  useEffect(() => {
    if (platform !== 'instagram') return;
    let current = true;
    getInstagramStatus().then(({ data }) => { if (current) setInstagramStatus(data); })
      .catch((error) => { if (current) setInstagramStatus({ connected: null, status: 'error', error: formatApiError(error, 'Could not verify the Instagram connection.') }); });
    return () => { current = false; };
  }, [platform]);

  const value = useMemo(() => ({ platform, setPlatform, instagramStatus }), [platform, instagramStatus]);
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
};

export const usePlatform = () => {
  const context = useContext(PlatformContext);
  if (!context) throw new Error('usePlatform must be used within PlatformProvider');
  return context;
};
