import React from 'react';

export default function ErrorAlert({
  error,
  onRetry,
  onSwitchToMock,
  onOpenConfig
}) {
  return (
    <div className="error-alert" role="alert" aria-live="assertive">
      <div className="error-header">
        <span aria-hidden="true">⚠️</span>
        <span>Request Failed ({error?.code || 'ERROR'})</span>
      </div>

      <p className="error-message">
        {error?.message || 'An unexpected error occurred while communicating with the service.'}
      </p>

      {error?.endpoint && (
        <div className="error-details">
          <strong>Endpoint:</strong> {error.endpoint}
        </div>
      )}

      <div className="error-actions">
        {onRetry && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRetry}
          >
            🔄 Retry Request
          </button>
        )}

        {onSwitchToMock && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSwitchToMock}
          >
            📦 Switch to Offline Mock Mode
          </button>
        )}

        {onOpenConfig && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenConfig}
          >
            ⚙️ Check API Settings
          </button>
        )}
      </div>
    </div>
  );
}
