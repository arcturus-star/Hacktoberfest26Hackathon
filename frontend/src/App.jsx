import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header.jsx';
import StudentSelector from './components/StudentSelector.jsx';
import RecommendationList from './components/RecommendationList.jsx';
import LoadingSkeleton from './components/LoadingSkeleton.jsx';
import EmptyState from './components/EmptyState.jsx';
import ErrorAlert from './components/ErrorAlert.jsx';
import ConfigModal from './components/ConfigModal.jsx';
import {
  fetchStudents,
  fetchActivities,
  fetchRecommendations,
  resolveRecommendationsWithActivities,
  getApiBaseUrl,
  setApiBaseUrl,
  getIsMockMode,
  setIsMockMode
} from './services/api.js';

export default function App() {
  const [isMockMode, setIsMockModeState] = useState(() => getIsMockMode());
  const [apiBaseUrl, setApiBaseUrlState] = useState(() => getApiBaseUrl());
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [activities, setActivities] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [recMode, setRecMode] = useState('');
  const [recNotice, setRecNotice] = useState(null);
  const [limit, setLimit] = useState(5);

  const initialRequest = useRef(0);
  const recRequest = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load students & activities
  const loadInitialData = useCallback(async (currentMockMode = isMockMode, currentBaseUrl = apiBaseUrl) => {
    const token = ++initialRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const [studentsRes, activitiesRes] = await Promise.all([
        fetchStudents({ mockMode: currentMockMode, baseUrl: currentBaseUrl }),
        fetchActivities({ mockMode: currentMockMode, baseUrl: currentBaseUrl })
      ]);

      if (token !== initialRequest.current) return;
      const loadedStudents = studentsRes.students || [];
      const loadedActivities = activitiesRes.activities || [];
      setStudents(loadedStudents);
      setActivities(loadedActivities);

      if (loadedStudents.length > 0) {
        setSelectedStudentId(prev => {
          const exists = loadedStudents.some(s => s.id === prev);
          return exists ? prev : loadedStudents[0].id;
        });
      }
    } catch (err) {
      if (token === initialRequest.current) setError(err);
    } finally {
      if (token === initialRequest.current) setIsLoading(false);
    }
  }, [isMockMode, apiBaseUrl]);

  // Load recommendations for selected student
  const loadRecommendations = useCallback(async (
    studentId = selectedStudentId,
    lim = limit,
    currentMockMode = isMockMode,
    currentBaseUrl = apiBaseUrl,
    currentActivities = activities
  ) => {
    if (!studentId) return;
    const token = ++recRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchRecommendations(studentId, lim, {
        mockMode: currentMockMode,
        baseUrl: currentBaseUrl
      });

      if (token !== recRequest.current) return;
      const rawRecs = res.recommendations || [];
      const resolved = resolveRecommendationsWithActivities(rawRecs, currentActivities);

      setRecommendations(resolved);
      setRecMode(res.mode || (currentMockMode ? 'mock' : 'fallback'));
      setRecNotice(res.notice || null);
    } catch (err) {
      if (token === recRequest.current) setError(err);
    } finally {
      if (token === recRequest.current) setIsLoading(false);
    }
  }, [selectedStudentId, limit, isMockMode, apiBaseUrl, activities]);

  // Trigger initial fetch
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Trigger recommendation load whenever selected student or limit changes
  useEffect(() => {
    if (selectedStudentId && activities.length > 0) {
      loadRecommendations(selectedStudentId, limit, isMockMode, apiBaseUrl, activities);
    }
  }, [selectedStudentId, limit, activities, isMockMode, apiBaseUrl, loadRecommendations]);

  function handleToggleMode() {
    const next = !isMockMode;
    setIsMockModeState(next);
    setIsMockMode(next);
    setActivities([]);
    ++recRequest.current;
  }

  function handleSaveBaseUrl(newUrl) {
    const saved = setApiBaseUrl(newUrl);
    setApiBaseUrlState(saved);
    if (!isMockMode) {
      loadInitialData(false, saved);
    }
  }

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  return (
    <div className="app-container">
      <Header
        isMockMode={isMockMode}
        onToggleMode={handleToggleMode}
        onOpenConfig={() => setIsConfigOpen(true)}
      />

      {isMockMode ? (
        <aside className="mode-banner mode-banner-mock" role="region" aria-label="Mock Mode Active">
          <div className="mode-banner-content">
            <span aria-hidden="true">💡</span>
            <span>
              <strong>Mock Mode Active:</strong> Showing synthetic offline fixture data adhering to the backend schema.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
            onClick={handleToggleMode}
          >
            Connect to Live Server
          </button>
        </aside>
      ) : (
        <aside className="mode-banner mode-banner-live" role="region" aria-label="Live Mode Active">
          <div className="mode-banner-content">
            <span aria-hidden="true">🌐</span>
            <span>
              <strong>Live API Mode:</strong> Targeting backend at <code>{apiBaseUrl}</code>.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
            onClick={handleToggleMode}
          >
            Switch to Mock Mode
          </button>
        </aside>
      )}

      <main className="main-content">
        <div className="discovery-layout">
          <StudentSelector
            students={students}
            selectedStudentId={selectedStudentId}
            onSelectStudent={setSelectedStudentId}
            disabled={isLoading}
          />

          <div className="recommendations-column">
            {error ? (
              <ErrorAlert
                error={error}
                onRetry={() => {
                  if (students.length === 0 || activities.length === 0) {
                    loadInitialData();
                  } else {
                    loadRecommendations();
                  }
                }}
                onSwitchToMock={handleToggleMode}
                onOpenConfig={() => setIsConfigOpen(true)}
              />
            ) : isLoading ? (
              <LoadingSkeleton />
            ) : recommendations.length === 0 ? (
              <EmptyState
                studentName={selectedStudent?.name}
                onSelectAnother={() => {
                  const other = students.find(s => s.id !== selectedStudentId);
                  if (other) setSelectedStudentId(other.id);
                }}
              />
            ) : (
              <RecommendationList
                recommendations={recommendations}
                mode={recMode}
                notice={recNotice}
                limit={limit}
                onChangeLimit={setLimit}
                onRefresh={() => loadRecommendations()}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </main>

      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        apiBaseUrl={apiBaseUrl}
        onSaveBaseUrl={handleSaveBaseUrl}
        isMockMode={isMockMode}
        onToggleMockMode={handleToggleMode}
      />

      <footer className="app-footer" role="contentinfo">
        <p>Synthetic student activity demo · Times in Europe/London · University/calendar integrations are not connected</p>
      </footer>
    </div>
  );
}
