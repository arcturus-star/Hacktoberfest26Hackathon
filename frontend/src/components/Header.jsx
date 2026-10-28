import React from 'react';

export default function Header({ isMockMode, onToggleMode, onOpenConfig }) {
  return (
    <header className="app-header" role="banner">
      <div className="header-content">
        <div className="brand-section">
          <div className="brand-logo-badge" aria-hidden="true">LU</div>
          <div className="brand-titles">
            <h1>Student Activity Discovery</h1>
            <p>Loughborough University Hackathon MVP</p>
          </div>
        </div>

        <div className="header-controls">
          <button
            type="button"
            className="btn btn-ghost-light"
            onClick={onToggleMode}
            aria-label={`Switch data mode. Current mode is ${isMockMode ? 'Mock Mode' : 'Live API'}`}
            title="Toggle between Live API and Offline Mock Mode"
          >
            {isMockMode ? (
              <>
                <span className="badge badge-mock">Offline Mock Active</span>
                <span>Switch to Live</span>
              </>
            ) : (
              <>
                <span className="badge badge-live">Live API Active</span>
                <span>Switch to Mock</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn-ghost-light"
            onClick={onOpenConfig}
            aria-label="Open API settings"
            title="Configure API Base URL and test health"
          >
            ⚙️ Settings
          </button>
        </div>
      </div>
    </header>
  );
}
