import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock3, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LabelList } from 'recharts';
import { getBestPostingTimes, getApiErrorMessage } from '../services/api';
import MetricCard from '../components/ui/MetricCard';
import ChartCard from '../components/ui/ChartCard';
import EmptyState from '../components/ui/EmptyState';
import SectionHeader from '../components/ui/SectionHeader';
import { PageSkeleton } from '../components/ui/Skeleton';
import { usePlatform } from '../context/PlatformContext';

const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const display = (value) => number(value) === null ? '—' : value.toLocaleString();

const BestTimeToPost = () => {
  const { platform } = usePlatform();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBestPostingTimes(platform)
      .then(({ data: result }) => { if (!cancelled) setData(result); })
      .catch((requestError) => { if (!cancelled) setError(getApiErrorMessage(requestError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [platform]);

  if (loading) return <PageSkeleton type="dashboard" />;

  const days = data?.best_days || [];
  const hours = data?.best_hours || [];
  const heatmap = data?.heatmap || [];
  const recommendations = data?.recommendations || [];
  const maxAverage = Math.max(0, ...heatmap.flatMap((row) => row.map((cell) => number(cell.avg_engagement) ?? 0)));
  const scope = data?.account_id ? 'Selected Facebook page' : 'All stored Facebook pages (no page selected)';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <SectionHeader title="Best Time to Post" subtitle={`Historical ${platform === 'instagram' ? 'Instagram' : 'Facebook'} post activity and engagement. Recommendations are descriptive and do not guarantee future results.`} />
      {error && <p role="alert" style={{ color: 'var(--error)' }}>Could not load posting-time analytics ({error}).</p>}
      <div style={{ marginTop: '-1rem', marginBottom: '1.25rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Scope: {scope} · Times shown in {data?.timezone || 'UTC'}.
      </div>

      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <MetricCard title="Timestamped Posts" value={display(data?.timestamped_posts)} subtitle="Valid Facebook post timestamps" icon={CalendarDays} />
        <MetricCard title="Comparable Posts" value={display(data?.scored_posts)} subtitle="Same observed metrics used for each score" icon={BarChart3} />
        <MetricCard title="Recommendation Confidence" value={data?.tentative ? 'Tentative' : data?.available ? 'Historical' : 'Insufficient data'} subtitle={`At least ${data?.minimum_bucket_sample ?? 2} comparable posts per time group`} icon={Clock3} />
      </div>

      {data?.score_basis?.metrics?.length > 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Score uses {data.score_basis.metrics.map((metric) => `${metric} × ${data.score_basis.weights[metric]}`).join(' + ')} per post. A metric is included only when at least 80% of posts have it; posts missing an included metric are excluded. Shares remain unavailable when the stored records do not contain them.
        </p>
      )}

      {data?.available ? (
        <>
          {data.tentative && <p role="status" className="card" style={{ borderColor: 'var(--warning)', color: 'var(--text-muted)' }}>These findings are tentative because the comparable history contains fewer than 10 posts. Add more historical posts before relying on the ranking.</p>}
          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            <ChartCard title="Average Engagement by Weekday" subtitle={`Per comparable post · ${data.timezone}`} height="340px">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily_distribution || []} margin={{ top: 22, right: 12, left: 18, bottom: 48 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={64} label={{ value: `Weekday (${data.timezone})`, position: 'insideBottom', offset: -42, fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} label={{ value: 'Weighted interactions per post', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
                  <RechartsTooltip formatter={(value, _name, item) => [number(value) === null ? 'Unavailable' : Number(value).toFixed(2), `${item.payload.scored_posts} comparable posts (${item.payload.posts} timestamped)`]} />
                  <Bar dataKey="avg_engagement" name="Average per post" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="avg_engagement" position="top" formatter={(value) => number(value) === null ? '' : value} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Average Engagement by Hour" subtitle={`Per comparable post · ${data.timezone}`} height="340px">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hourly_distribution || []} margin={{ top: 22, right: 12, left: 18, bottom: 42 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} interval={2} label={{ value: `Hour (${data.timezone}, HH:00)`, position: 'insideBottom', offset: -32, fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} label={{ value: 'Weighted interactions per post', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
                  <RechartsTooltip formatter={(value, _name, item) => [number(value) === null ? 'Unavailable' : Number(value).toFixed(2), `${item.payload.scored_posts} comparable posts (${item.payload.posts} timestamped)`]} />
                  <Bar dataKey="avg_engagement" name="Average per post" fill="#8b5cf6" radius={[3, 3, 0, 0]}>
                    <LabelList dataKey="avg_engagement" position="top" formatter={(value) => number(value) === null ? '' : value} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            {[{ title: 'Best-performing days', rows: days, label: (row) => row.day }, { title: 'Best individual hours', rows: hours, label: (row) => row.hour }].map((group) => <div className="card" key={group.title}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>{group.title}</h2>
              {group.rows.length ? <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>{group.rows.map((row) => <li key={group.label(row)} style={{ padding: '0.4rem 0', color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-main)' }}>{group.label(row)}</strong> · {row.avg_engagement} average per post · {row.scored_posts} comparable posts of {row.posts} timestamped</li>)}</ol> : <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>No day or hour has enough comparable posts to rank yet.</p>}
            </div>)}
          </div>

          <ChartCard title="Weekly Day / Time Heatmap" subtitle={`Average comparable-post engagement by 3-hour window · ${data.timezone}`} height="auto">
            <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
              <div style={{ minWidth: '920px', display: 'grid', gridTemplateColumns: '104px repeat(8, minmax(96px, 1fr))', gap: '4px' }}>
                <div />
                {heatmap[0]?.map((cell) => <div key={cell.window_start_hour} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', padding: '0.35rem 0' }}>{cell.window.split('–')[0]}</div>)}
                {heatmap.map((row) => <React.Fragment key={row[0]?.day}>
                  <div style={{ alignSelf: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row[0]?.day}</div>
                  {row.map((cell) => {
                    const avg = number(cell.avg_engagement);
                    const intensity = avg === null || maxAverage === 0 ? 0 : avg / maxAverage;
                    return <div key={`${cell.day}-${cell.window_start_hour}`} title={`${cell.day}, ${cell.window} ${data.timezone} · ${avg === null ? 'No comparable score' : `Average score ${avg.toFixed(2)}`} · ${cell.scored_posts} comparable posts`} style={{ background: avg === null ? 'var(--chart-grid)' : `rgba(99, 102, 241, ${0.25 + intensity * 0.65})`, borderRadius: '5px', minHeight: '66px', display: 'grid', alignContent: 'center', gap: '0.15rem', textAlign: 'center', color: intensity > 0.55 ? '#fff' : 'var(--text-main)', fontSize: '0.7rem', padding: '0.2rem' }}>
                      <span>{avg === null ? 'No data' : `Average score: ${avg.toFixed(2)}`}</span><span style={{ fontSize: '0.68rem', opacity: 0.85 }}>{cell.scored_posts} comparable posts</span>
                    </div>;
                  })}
                </React.Fragment>)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
              <span>Average score scale:</span><span>Low</span><span aria-hidden="true" style={{ width: '135px', height: '10px', borderRadius: '5px', background: 'linear-gradient(90deg, rgba(99,102,241,0.25), rgba(99,102,241,0.9))' }} /><span>High</span><span style={{ padding: '0.15rem 0.35rem', background: 'var(--chart-grid)', borderRadius: '4px' }}>No data</span><span>Genuine zero is shown as 0.00 with a low-score color.</span>
            </div>
          </ChartCard>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>Recommended 3-hour Posting Windows</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Each window score is the average per-post score for timestamped posts in that weekday and 3-hour range. Individual best hours above are separate one-hour buckets.</p>
            {recommendations.length ? <ol style={{ paddingLeft: '1.25rem', marginBottom: 0 }}>
              {recommendations.map((item) => <li key={`${item.day}-${item.window_start_hour}`} style={{ marginBottom: '1rem', paddingLeft: '0.25rem' }}>
                <strong>{item.day}, {item.window} {data.timezone}</strong> · {item.avg_engagement} average weighted interactions per post · {item.scored_posts} comparable posts of {item.posts} timestamped {item.tentative ? <span style={{ color: 'var(--warning)' }}>· tentative</span> : null}
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{item.reason}</div>
              </li>)}
            </ol> : <EmptyState icon={Clock3} title="No ranked windows yet" description={data.availability_reason || 'More timestamped comparable posts are needed before recommending a window.'} />}
          </div>
        </>
      ) : !error ? <EmptyState icon={CalendarDays} title="Not enough historical data" description={data?.availability_reason || 'Add analyzed Facebook posts with timestamps and observed engagement metrics to compare posting windows.'} /> : null}
    </div>
  );
};

export default BestTimeToPost;
