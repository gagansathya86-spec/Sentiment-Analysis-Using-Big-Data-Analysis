import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DatasetProvider } from './context/DatasetContext';

import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// Social Intelligence & Core Pages
import Dashboard from './pages/Dashboard';
import UnifiedAnalytics from './pages/UnifiedAnalytics';

// Data Sources
import Facebook from './pages/Facebook';
import Instagram from './pages/Instagram';
import Upload from './pages/Upload';

// Advanced Analytics
import AspectAnalysis from './pages/AspectAnalysis';
import EngagementAnalytics from './pages/EngagementAnalytics';
import ViralPotential from './pages/ViralPotential';
import CrisisAlerts from './pages/CrisisAlerts';
import Trends from './pages/Trends';
import { SentimentDashboard } from './pages/SentimentDashboard';
import Behavior from './pages/Behavior';

// Models & Big Data
import ModelEval from './pages/ModelEval';
import Sentiment from './pages/Sentiment';
import Explorer from './pages/Explorer';
import Mapping from './pages/Mapping';
import Preprocessing from './pages/Preprocessing';

// Administration
import Reports from './pages/Reports';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <DatasetProvider>
      <Router>
        <Layout>
          <Routes>
            {/* Default Route */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Social Intelligence */}
            <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/unified" element={<ErrorBoundary><UnifiedAnalytics /></ErrorBoundary>} />

            {/* Data Sources */}
            <Route path="/facebook" element={<ErrorBoundary><Facebook /></ErrorBoundary>} />
            <Route path="/instagram" element={<ErrorBoundary><Instagram /></ErrorBoundary>} />
            <Route path="/upload" element={<ErrorBoundary><Upload /></ErrorBoundary>} />

            {/* Advanced Analytics */}
            <Route path="/aspects" element={<ErrorBoundary><AspectAnalysis /></ErrorBoundary>} />
            <Route path="/engagement-analytics" element={<ErrorBoundary><EngagementAnalytics /></ErrorBoundary>} />
            <Route path="/viral-potential" element={<ErrorBoundary><ViralPotential /></ErrorBoundary>} />
            <Route path="/alerts" element={<ErrorBoundary><CrisisAlerts /></ErrorBoundary>} />
            <Route path="/trends" element={<ErrorBoundary><Trends /></ErrorBoundary>} />
            <Route path="/sentiment-dashboard" element={<ErrorBoundary><SentimentDashboard /></ErrorBoundary>} />
            <Route path="/behavior" element={<ErrorBoundary><Behavior /></ErrorBoundary>} />

            {/* Models & Big Data */}
            <Route path="/eval" element={<ErrorBoundary><ModelEval /></ErrorBoundary>} />
            <Route path="/sentiment" element={<ErrorBoundary><Sentiment /></ErrorBoundary>} />
            <Route path="/explorer" element={<ErrorBoundary><Explorer /></ErrorBoundary>} />
            <Route path="/mapping" element={<ErrorBoundary><Mapping /></ErrorBoundary>} />
            <Route path="/preprocess" element={<ErrorBoundary><Preprocessing /></ErrorBoundary>} />

            {/* Administration */}
            <Route path="/reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
            <Route path="/insights" element={<Navigate to="/reports" replace />} />
            <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      </Router>
    </DatasetProvider>
  );
}

export default App;

