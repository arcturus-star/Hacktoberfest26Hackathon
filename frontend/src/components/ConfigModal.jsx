import React, { useState } from 'react';
import { checkHealth } from '../services/api.js';

export default function ConfigModal({
  isOpen,
  onClose,
  apiBaseUrl,
  onSaveBaseUrl,
  isMockMode,
  onToggleMockMode
}) {
  const [urlInput, setUrlInput] = useState(apiBaseUrl);
  const [healthStatus, setHealthStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  if (!isOpen) return null;

  async function handleTestHealth() {
    setIsChecking(true);
    setHealthStatus(null);
    try {
      const data = await checkHealth(urlInput);
      setHealthStatus({ ok: true, message: `Connected! Health status: ${data.status}` });
    } catch (err) {
      setHealthStatus({
        ok: false,
        message: `Connection failed: ${err.message || 'Unable to reach backend'}`
      });
    } finally {
      setIsChecking(false);
    }
  }

  function handleSave(e) {
    e.preventDefault();
    onSaveBaseUrl(urlInput);
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="config-modal-title">
      <div className="modal-content">
        <div className="modal-header">
          <h3 id="config-modal-title">API & Environment Settings</h3>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.5rem', fontSize: '1.1rem' }}
            onClick={onClose}
            aria-label="Close settings dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label htmlFor="base-url-input" className="form-label">
              Backend API Base URL
            </label>
            <input
              id="base-url-input"
              type="url"
              className="form-input"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="http://localhost:3001"
              required
            />
            <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
              Default is the current page origin. Override with <code>VITE_API_BASE_URL</code> or change here.
            </small>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTestHealth}
              disabled={isChecking}
            >
              {isChecking ? 'Checking...' : '🩺 Test Connection (GET /api/health)'}
            </button>
          </div>

          {healthStatus && (
            <div
              className={`badge ${healthStatus.ok ? 'badge-live' : 'badge-mock'}`}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}
            >
              {healthStatus.ok ? '✅ ' : '❌ '}
              {healthStatus.message}
            </div>
          )}

          <div className="form-group" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
            <span className="form-label">Data Mode</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={isMockMode}
                onChange={e => onToggleMockMode(e.target.checked)}
              />
              Enable Offline Mock Mode (Use synthetic local fixtures)
            </label>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
