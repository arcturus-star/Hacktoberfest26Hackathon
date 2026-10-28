import React from 'react';

export default function LoadingSkeleton() {
  return (
    <section className="recommendations-section" aria-busy="true" aria-live="polite">
      <div className="recommendations-header">
        <div className="skeleton-line skeleton-title"></div>
        <div className="skeleton-line skeleton-text-short"></div>
      </div>
      <div className="cards-grid">
        {[1, 2, 3].map(n => (
          <div key={n} className="skeleton-card">
            <div className="skeleton-line skeleton-title"></div>
            <div className="skeleton-line skeleton-text-short"></div>
            <div className="skeleton-box"></div>
            <div className="skeleton-line skeleton-text"></div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading recommendations...</span>
    </section>
  );
}
