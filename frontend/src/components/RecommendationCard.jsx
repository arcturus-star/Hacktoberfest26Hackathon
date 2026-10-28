import React, { useState } from 'react';
import { formatDateTimeRange } from '../utils/formatters.js';

export default function RecommendationCard({ recommendation }) {
  const { activityId, reason, activity, isResolved } = recommendation;
  const [showFriendPreview, setShowFriendPreview] = useState(false);
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

      <section className="feature-preview" aria-label="Future feature previews">
        <span className="badge badge-source">Concept preview · not connected</span>
        <details>
          <summary>Calendar example: “You’re free at this time”</summary>
          <p>With your permission, the app would compare this activity’s start and end with your calendar’s busy periods. If there were no overlaps, it would show this suggestion; conflicting activities could be filtered out. No calendar has been checked for this card.</p>
        </details>
        <button type="button" className="btn btn-secondary" aria-expanded={showFriendPreview} onClick={() => setShowFriendPreview(value => !value)}>
          Go with a friend · preview
        </button>
        {showFriendPreview && (
          <p role="status">You would choose a friend, preview an invitation to {activity?.name || 'this activity'}, then decide whether to send it. A future version could also suggest activities your consenting friends enjoy. This is an explanation only: no friend list is connected and no invitation is sent.</p>
        )}
      </section>

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
