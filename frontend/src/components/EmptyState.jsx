import React from 'react';

export default function EmptyState({ studentName, onSelectAnother }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <div className="empty-icon" aria-hidden="true">🌱</div>
      <h3>No Activities Recommended Right Now</h3>
      <p>
        We couldn't find any upcoming unvisited activities matching{' '}
        <strong>{studentName || 'this student'}</strong>'s profile or interests.
      </p>
      {onSelectAnother && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSelectAnother}
        >
          Select Another Student Profile
        </button>
      )}
    </div>
  );
}
