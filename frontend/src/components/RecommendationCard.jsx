import React from 'react';
import { formatDateTimeRange } from '../utils/formatters.js';

export default function RecommendationCard({ recommendation }) {
  const { activityId, reason, activity, isResolved } = recommendation;
  const timeFormatted = formatDateTimeRange(activity?.start, activity?.end);

  return (
    <article className="activity-card" aria-labelledby={`card-title-${activityId}`}>
      <div className="card-top">
        <h3 id={`card-title-${activityId}`} className="card-title">
          {activity?.name || `Activity ${activityId}`}
        </h3>
        {activity?.source && (
          <span className="badge badge-source">{activity.source}</span>
        )}
      </div>

      <div className="card-meta-row">
        <span className="meta-item" title="Date and Time">
          <span aria-hidden="true">🗓️</span>
          <span>{timeFormatted}</span>
        </span>
        <span className="meta-item" title="Location">
          <span aria-hidden="true">📍</span>
          <span>{activity?.location || 'Campus / Location Unlisted'}</span>
        </span>
      </div>

      <div className="reason-callout" role="note" aria-label="Recommendation reason">
        <div className="reason-label">Why Recommended</div>
        <div className="reason-text">💡 {reason}</div>
      </div>

      {activity?.description && (
        <p className="card-description">{activity.description}</p>
      )}

      <div className="card-footer">
        <div className="card-tags" aria-label="Activity tags">
          {(activity?.tags || []).map(tag => (
            <span key={tag} className="badge badge-tag">
              #{tag}
            </span>
          ))}
        </div>
        <div className="meta-item" style={{ fontSize: '0.75rem', color: '#64748b' }}>
          ID: {activityId}
          {!isResolved && (
            <span style={{ color: '#b91c1c', marginLeft: '0.5rem' }}>
              (unresolved details)
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
