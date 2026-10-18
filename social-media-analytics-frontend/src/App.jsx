import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DatasetProvider } from './context/DatasetContext';

import Layout from './components/Layout';
import Home from './pages/Home';
import Upload from './pages/Upload';
import Explorer from './pages/Explorer';
import Mapping from './pages/Mapping';
import Preprocessing from './pages/Preprocessing';
import Sentiment from './pages/Sentiment';
import Behavior from './pages/Behavior';
import Dashboard from './pages/Dashboard';
import { SentimentDashboard } from './pages/SentimentDashboard';
import { ModelEval } from './pages/ModelEval';
import { Trends } from './pages/Trends';
import { Insights } from './pages/PlaceholderPages';
import Facebook from './pages/Facebook';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <DatasetProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/mapping" element={<Mapping />} />
            <Route path="/preprocess" element={<Preprocessing />} />
            <Route path="/sentiment" element={<Sentiment />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/behavior" element={<Behavior />} />
            <Route path="/sentiment-dashboard" element={<SentimentDashboard />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/eval" element={<ModelEval />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/facebook" element={<ErrorBoundary><Facebook /></ErrorBoundary>} />
          </Routes>
        </Layout>
      </Router>
    </DatasetProvider>
  );
}

export default App;
