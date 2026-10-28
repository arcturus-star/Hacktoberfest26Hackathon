/**
 * Formats an ISO 8601 date string or timestamp range into human-readable UK format.
 * E.g., "Sunday, 1 Nov 2026 · 14:00 - 15:30"
 */
export function formatDateTimeRange(startIso, endIso) {
  if (!startIso) return 'Time not specified';
  try {
    const startDate = new Date(startIso);
    if (isNaN(startDate.getTime())) return startIso;

    const dateOptions = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    const timeOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };

    const datePart = startDate.toLocaleDateString('en-GB', dateOptions);
    const startTimePart = startDate.toLocaleTimeString('en-GB', timeOptions);

    if (endIso) {
      const endDate = new Date(endIso);
      if (!isNaN(endDate.getTime())) {
        const endTimePart = endDate.toLocaleTimeString('en-GB', timeOptions);
        return `${datePart} · ${startTimePart} – ${endTimePart}`;
      }
    }
    return `${datePart} · ${startTimePart}`;
  } catch {
    return startIso;
  }
}

/**
 * Truncates text with ellipsis if length exceeds limit.
 */
export function truncateText(text, maxLength = 160) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}
