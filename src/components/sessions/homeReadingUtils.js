// Reading status types for home reading
export const READING_STATUS = {
  READ: 'read', // ✓ - Child read
  MULTIPLE: 'multiple', // Number - Multiple reading sessions
  ABSENT: 'absent', // A - Absent
  NO_RECORD: 'no_record', // • - No reading record received
  NONE: 'none', // No entry yet
};

// Where a day's reads came from. Colours stay in the cozy palette:
// sage = home (teacher-recorded), muted teal = school, soft plum = parent app.
export const READ_SOURCE_COLORS = {
  home: { main: '#6B8E6B', light: '#8AAD8A', dark: '#557055', soft: 'rgba(107, 142, 107, 0.18)' },
  school: { main: '#7A9EAD', light: '#9BB7C3', dark: '#5F7E8B', soft: 'rgba(122, 158, 173, 0.22)' },
  parent: { main: '#A58BB8', light: '#BCA9CA', dark: '#84699A', soft: 'rgba(165, 139, 184, 0.22)' },
};

export const READ_SOURCE_LABELS = {
  home: 'home',
  school: 'school',
  parent: 'parent app',
};

// Derive the source list from a getStudentReadingStatus result
export const getReadSources = ({ homeCount = 0, parentCount = 0, schoolCount = 0 } = {}) => {
  const sources = [];
  if (homeCount > 0) sources.push('home');
  if (parentCount > 0) sources.push('parent');
  if (schoolCount > 0) sources.push('school');
  return sources.length > 0 ? sources : ['home'];
};

// CSS background for a set of sources: solid colour for one source,
// hard-stop diagonal split when reads came from several places.
export const sourcesBackground = (sources, tone = 'main') => {
  const colors = sources.map((s) => READ_SOURCE_COLORS[s][tone]);
  if (colors.length === 1) return colors[0];
  const seg = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * seg}% ${(i + 1) * seg}%`).join(', ');
  return `linear-gradient(135deg, ${stops})`;
};

export const describeReadSources = (sources) =>
  sources.map((s) => READ_SOURCE_LABELS[s]).join(' + ');

export const formatDateISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Get yesterday's date in YYYY-MM-DD format
export const getYesterday = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDateISO(yesterday);
};

// Format date for display
export const formatDateDisplay = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// Format assessment for display
export const formatAssessment = (assessment) => {
  if (assessment === null || assessment === undefined) return null;
  if (typeof assessment === 'number') return `${assessment}/10`;
  return null;
};

export const getAssessmentColor = (assessment) => {
  if (assessment === null || assessment === undefined) return 'default';
  if (typeof assessment === 'number') {
    if (assessment <= 3) return 'error';
    if (assessment <= 6) return 'warning';
    return 'success';
  }
  return 'default';
};

export const DATE_PRESETS = {
  THIS_WEEK: 'this_week',
  LAST_WEEK: 'last_week',
  LAST_MONTH: 'last_month',
  CURRENT_TERM: 'current_term',
  SCHOOL_YEAR: 'school_year',
  CUSTOM: 'custom',
};

export const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

export const getStartOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const getEndOfMonth = (date) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const formatDateHeader = (date) => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: dayNames[date.getDay()],
    date: date.getDate(),
  };
};

export const getDateRange = (start, end) => {
  const dates = [];
  const current = new Date(start);
  // eslint-disable-next-line no-unmodified-loop-condition
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

/**
 * Build the session payloads for a multi-day catch-up entry of `count` days
 * ending on `selectedDate` (walking backward day by day). Pure — used by the
 * register's quick and full views, sent to POST /sessions/bulk in one request.
 *
 * Rules (mirroring the original per-day POST loop exactly):
 * - A previous day that already holds a genuine reading record (school session
 *   or directly-logged home read) is skipped — never double-counted.
 * - A previous day with an ABSENT/NO_RECORD marker keeps its marker: the
 *   catch-up read is written on that day (so streaks see it) AND an extra
 *   session is written on selectedDate (so the selected date shows the count).
 *
 * @param {string} selectedDate - YYYY-MM-DD anchor date
 * @param {number} count - days to record, including selectedDate
 * @param {Array<{date: string, location?: string, notes?: string}>} studentSessions
 * @param {string|null} bookId
 * @returns {Array<object>} addReadingSession-shaped payloads
 */
export const buildMultiDaySessions = (selectedDate, count, studentSessions, bookId) => {
  const sessions = [];
  for (let i = 0; i < count; i++) {
    const sessionDate = new Date(selectedDate + 'T12:00:00');
    sessionDate.setDate(sessionDate.getDate() - i);
    const dateStr = formatDateISO(sessionDate);

    // Don't double-count a previous day that already has a genuine reading
    // record. Backfill sessions are deleted by the caller and re-created,
    // so they're excluded here.
    if (
      i > 0 &&
      studentSessions.some(
        (s) =>
          s.date === dateStr &&
          !s.notes?.includes('[ABSENT]') &&
          !s.notes?.includes('[NO_RECORD]') &&
          !s.notes?.includes('[BACKFILL]')
      )
    ) {
      continue;
    }

    const dayHasMarker =
      i > 0 &&
      studentSessions.some(
        (s) =>
          s.date === dateStr &&
          s.location === 'home' &&
          (s.notes?.includes('[ABSENT]') || s.notes?.includes('[NO_RECORD]'))
      );

    // Session on the actual day (for streak calculation)
    sessions.push({
      date: dateStr,
      assessment: null,
      notes: i > 0 ? '[BACKFILL]' : '',
      bookId,
      location: 'home',
    });
    if (dayHasMarker) {
      // Marker stays visible — also credit the selected date for display count
      sessions.push({
        date: selectedDate,
        assessment: null,
        notes: '',
        bookId,
        location: 'home',
      });
    }
  }
  return sessions;
};
