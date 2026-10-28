import React from 'react';
import RecommendationCard from './RecommendationCard.jsx';

export default function RecommendationList({
  recommendations = [],
  mode,
  notice,
  limit,
  onChangeLimit,
  onRefresh,
  isLoading
}) {
  return (
    <section className="recommendations-section" aria-labelledby="rec-section-heading">
      <div className="recommendations-header">
        <div className="rec-title-wrap">
          <h2 id="rec-section-heading">Recommended Activities</h2>
          <div className="rec-meta-badges">
            {mode === 'gemma' && (
              <span className="badge badge-gemma">✨ AI Ranked (Gemma)</span>
            )}
            {mode === 'fallback' && (
              <span className="badge badge-fallback">⚡ Deterministic Fallback</span>
            )}
            {mode === 'mock' && (
              <span className="badge badge-mock">📦 Offline Mock</span>
            )}
            <span className="badge badge-source">{recommendations.length} recommendations</span>
          </div>
        </div>

        <div className="rec-controls">
          <label htmlFor="limit-select" className="sr-only">Recommendation Limit</label>
          <select
            id="limit-select"
            className="form-select"
            style={{ width: 'auto' }}
            value={limit}
            onChange={e => onChangeLimit(Number(e.target.value))}
            disabled={isLoading}
            title="Max recommendations to fetch"
          >
            <option value={3}>Limit: 3</option>
            <option value={5}>Limit: 5</option>
            <option value={10}>Limit: 10</option>
          </select>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh recommendations"
            title="Reload recommendations from backend or mock store"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {notice && (
        <aside className="rec-notice-banner" role="status" aria-live="polite">
          <span aria-hidden="true">ℹ️</span>
          <span>{notice}</span>
        </aside>
      )}

      <div className="cards-grid">
        {recommendations.map(rec => (
          <RecommendationCard key={rec.activityId} recommendation={rec} />
        ))}
      </div>
    </section>
  );
}
