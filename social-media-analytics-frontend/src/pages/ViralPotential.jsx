import React, { useState, useEffect } from 'react';
import { 
  Zap, Award, AlertCircle, ArrowUpRight, CheckCircle2, 
  HelpCircle, RefreshCw, Send, Sparkles, MessageCircle, Heart
} from 'lucide-react';
import { motion } from 'framer-motion';

import { getRankedViralPosts, scoreDraftPost } from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import SectionHeader from '../components/ui/SectionHeader';
import SentimentBadge from '../components/ui/SentimentBadge';
import EmptyState from '../components/ui/EmptyState';

const ViralPotential = () => {
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [rankedPosts, setRankedPosts] = useState([]);
  
  // Simulator State
  const [draftText, setDraftText] = useState(
    "Excited to unveil our new Big Data real-time engine! Which feature should we benchmark next? Comment below! #BigData #Tech"
  );
  const [draftLikes, setDraftLikes] = useState(120);
  const [draftComments, setDraftComments] = useState(35);
  const [draftPlatform, setDraftPlatform] = useState('instagram');
  const [draftSentiment, setDraftSentiment] = useState('positive');
  
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  const fetchRanked = async () => {
    setLoading(true);
    try {
      const res = await getRankedViralPosts(platform, 15);
      setRankedPosts(res.data.ranked_posts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRanked();
  }, [platform]);

  const handleSimulateDraft = async (e) => {
    e.preventDefault();
    setSimLoading(true);
    try {
      const res = await scoreDraftPost({
        text: draftText,
        likes: parseInt(draftLikes, 10) || 0,
        comments: parseInt(draftComments, 10) || 0,
        platform: draftPlatform,
        sentiment: draftSentiment,
        confidence: 0.90,
        created_time: new Date().toISOString()
      });
      setSimResult(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <SectionHeader 
            title="Viral Post Potential Estimator" 
            subtitle="Transparent multi-factor heuristic scoring (0-100) evaluating interaction volume, discussion friction velocity, prime audience windows, and emotional polarity."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select 
            value={platform} 
            onChange={(e) => setPlatform(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          >
            <option value="all">All Sources</option>
            <option value="facebook">Facebook Only</option>
            <option value="instagram">Instagram Only</option>
          </select>
          <button className="btn-secondary" onClick={fetchRanked} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Methodology Explainer Card */}
      <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: 'rgba(245, 158, 11, 0.04)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <Zap size={20} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.875rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Scientific Heuristic Architecture: </span>
            Evaluates 5 verifiable factors: 
            <strong> (1) Interaction Volume</strong>, 
            <strong> (2) Discussion Velocity Ratio</strong> (comments per like), 
            <strong> (3) Emotional Polarity Intensity</strong> (high sentiment confidence), 
            <strong> (4) Prime Timing Window</strong> (11-14 or 18-21 UTC), and 
            <strong> (5) Discoverability Tags</strong>.
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Disclaimer: Transparent heuristic estimate for content optimization — not an infallible future guarantee.
            </div>
          </div>
        </div>
      </div>

      {/* Ranked Feed Table */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>Ranked Feed by Viral Potential Score</h3>
        
        {rankedPosts.length === 0 ? (
          <EmptyState icon={Zap} title="No Posts Evaluated" description="Feed empty or loading." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Rank</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Score</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Tier</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Platform</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Post Text</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Driving Factors</th>
                </tr>
              </thead>
              <tbody>
                {rankedPosts.map((post, idx) => (
                  <tr key={post.post_id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: idx < 3 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      #{idx + 1}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: post.tier_color }}>
                          {post.viral_score}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/ 100</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="badge" style={{ backgroundColor: `${post.tier_color}18`, color: post.tier_color, fontSize: '0.75rem' }}>
                        {post.tier}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>
                      {post.platform}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '320px', lineHeight: 1.4 }}>
                      {post.text}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem' }}>
                        {post.contributing_factors?.slice(0, 2).map((f, i) => (
                          <span key={i} style={{ color: 'var(--text-muted)' }}>
                            • <strong style={{ color: 'var(--text-main)' }}>{f.factor}</strong> ({f.points})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Viral Draft Simulator */}
      <div className="card">
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Interactive Viral Draft Simulator</h3>
        <p style={{ margin: '0 0 1.25rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Evaluate draft copy and expected interaction metrics before publishing.
        </p>

        <form onSubmit={handleSimulateDraft}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Draft Caption / Text:</label>
            <textarea 
              rows={3} 
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              style={{ width: '100%', fontSize: '0.875rem' }}
            />
          </div>

          <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Expected Likes:</label>
              <input 
                type="number" 
                value={draftLikes} 
                onChange={(e) => setDraftLikes(e.target.value)} 
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Expected Comments:</label>
              <input 
                type="number" 
                value={draftComments} 
                onChange={(e) => setDraftComments(e.target.value)} 
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Target Platform:</label>
              <select 
                value={draftPlatform} 
                onChange={(e) => setDraftPlatform(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Sentiment Tone:</label>
              <select 
                value={draftSentiment} 
                onChange={(e) => setDraftSentiment(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="positive">Positive</option>
                <option value="negative">Controversial/Negative</option>
                <option value="neutral">Neutral/Informational</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={simLoading}>
            <Zap size={15} /> {simLoading ? 'Simulating...' : 'Calculate Viral Potential'}
          </button>
        </form>

        {simResult && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ 
                padding: '0.5rem 1rem', 
                backgroundColor: 'rgba(255,255,255,0.03)', 
                borderRadius: 'var(--radius)', 
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimated Score</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: simResult.tier_color }}>
                  {simResult.viral_score}
                </div>
              </div>

              <div>
                <span className="badge" style={{ backgroundColor: `${simResult.tier_color}18`, color: simResult.tier_color, fontSize: '0.85rem' }}>
                  {simResult.tier}
                </span>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {simResult.disclaimer}
                </div>
              </div>
            </div>

            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Factor Breakdown:</h4>
            <div className="grid-2" style={{ marginBottom: '1rem' }}>
              {simResult.contributing_factors?.map((f, i) => (
                <div key={i} style={{ padding: '0.6rem 0.75rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.85rem' }}>
                    <span>{f.factor}</span>
                    <span style={{ color: 'var(--primary)' }}>{f.points} pts</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {f.detail}
                  </div>
                </div>
              ))}
            </div>

            {simResult.recommendations?.length > 0 && (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(79, 70, 229, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(79, 70, 229, 0.2)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Actionable Recommendations:</div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                  {simResult.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ViralPotential;
