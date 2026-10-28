/**
 * API Service for student activity recommendations.
 * Implements the contract defined in docs/superpowers/plans/2026-10-28-backend.md
 */

import {
  MOCK_STUDENTS,
  MOCK_ACTIVITIES,
  generateMockRecommendations
} from './mockData.js';

const STORAGE_KEY_BASE_URL = 'lboro_rec_api_base_url';
const STORAGE_KEY_MOCK_MODE = 'lboro_rec_mock_mode';

const DEFAULT_API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  'http://localhost:3001';

/**
 * Returns the currently configured API base URL (from localStorage, env, or default).
 */
export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem(STORAGE_KEY_BASE_URL);
    if (saved) return saved;
  }
  return DEFAULT_API_BASE_URL;
}

/**
 * Sets and saves the API base URL.
 */
export function setApiBaseUrl(url) {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY_BASE_URL, trimmed);
  }
  return trimmed;
}

/**
 * Returns whether mock mode is currently enabled by the user.
 * Defaults to true if no preference is set, so the app is instantly usable while backend is offline.
 */
export function getIsMockMode() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem(STORAGE_KEY_MOCK_MODE);
    if (saved !== null) {
      return saved === 'true';
    }
  }
  return true; // Default to mock mode initially until user switches to live backend
}

/**
 * Sets mock mode toggle in localStorage.
 */
export function setIsMockMode(enabled) {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY_MOCK_MODE, enabled ? 'true' : 'false');
  }
}

/**
 * Helper to handle fetch errors adhering to the backend JSON error format:
 * {"error":{"code":"STUDENT_NOT_FOUND","message":"Student not found."}}
 */
async function handleResponse(response, endpoint) {
  if (!response.ok) {
    let errorCode = `HTTP_${response.status}`;
    let errorMessage = `Server responded with status ${response.status} (${response.statusText})`;
    try {
      const errorJson = await response.json();
      if (errorJson && errorJson.error) {
        errorCode = errorJson.error.code || errorCode;
        errorMessage = errorJson.error.message || errorMessage;
      }
    } catch {
      // Body was not JSON
    }
    const err = new Error(errorMessage);
    err.code = errorCode;
    err.status = response.status;
    err.endpoint = endpoint;
    throw err;
  }
  return await response.json();
}

/**
 * Checks backend health: GET /api/health
 */
export async function checkHealth(customBaseUrl = null) {
  const baseUrl = customBaseUrl || getApiBaseUrl();
  const endpoint = `${baseUrl}/api/health`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  return await handleResponse(response, endpoint);
}

/**
 * Fetches the list of students: GET /api/students
 */
export async function fetchStudents(options = {}) {
  const isMock = options.mockMode ?? getIsMockMode();
  if (isMock) {
    // Simulate brief network delay for realism
    await new Promise(r => setTimeout(r, 120));
    return { students: [...MOCK_STUDENTS] };
  }

  const baseUrl = options.baseUrl || getApiBaseUrl();
  const endpoint = `${baseUrl}/api/students`;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    return await handleResponse(response, endpoint);
  } catch (err) {
    if (!err.endpoint) err.endpoint = endpoint;
    throw err;
  }
}

/**
 * Fetches the list of activities: GET /api/activities
 */
export async function fetchActivities(options = {}) {
  const isMock = options.mockMode ?? getIsMockMode();
  if (isMock) {
    await new Promise(r => setTimeout(r, 120));
    return { activities: [...MOCK_ACTIVITIES] };
  }

  const baseUrl = options.baseUrl || getApiBaseUrl();
  const endpoint = `${baseUrl}/api/activities`;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    return await handleResponse(response, endpoint);
  } catch (err) {
    if (!err.endpoint) err.endpoint = endpoint;
    throw err;
  }
}

/**
 * Fetches recommendations for a student: GET /api/students/:id/recommendations?limit=:limit
 */
export async function fetchRecommendations(studentId, limit = 5, options = {}) {
  const isMock = options.mockMode ?? getIsMockMode();
  if (isMock) {
    await new Promise(r => setTimeout(r, 160));
    return generateMockRecommendations(studentId, limit);
  }

  const baseUrl = options.baseUrl || getApiBaseUrl();
  const endpoint = `${baseUrl}/api/students/${encodeURIComponent(studentId)}/recommendations?limit=${encodeURIComponent(limit)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    return await handleResponse(response, endpoint);
  } catch (err) {
    if (!err.endpoint) err.endpoint = endpoint;
    throw err;
  }
}

/**
 * Resolves recommendation items (which contain activityId and reason)
 * with their full activity details (name, start, end, location, tags, description).
 *
 * @param {Array<{activityId: string, reason: string}>} recommendations
 * @param {Array<{id: string, name: string, start: string, end: string, location: string, tags: string[], description: string}>} activities
 * @returns {Array} Resolved recommendation objects
 */
export function resolveRecommendationsWithActivities(recommendations = [], activities = []) {
  const activityMap = new Map((activities || []).map(a => [a.id, a]));

  return (recommendations || []).map(rec => {
    const details = activityMap.get(rec.activityId);
    return {
      activityId: rec.activityId,
      reason: rec.reason,
      activity: details || {
        id: rec.activityId,
        name: `Activity ${rec.activityId}`,
        description: 'Details currently unavailable from activity catalogue.',
        tags: [],
        start: null,
        end: null,
        location: 'Location unlisted',
        source: 'unresolved'
      },
      isResolved: Boolean(details)
    };
  });
}
