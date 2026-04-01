// Reading status types for home reading
export const READING_STATUS = {
  READ: 'read', // ✓ - Child read
  MULTIPLE: 'multiple', // Number - Multiple reading sessions
  ABSENT: 'absent', // A - Absent
  NO_RECORD: 'no_record', // • - No reading record received
  NONE: 'none', // No entry yet
};

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
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};
