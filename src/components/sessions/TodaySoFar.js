import React, { useEffect, useState } from 'react';
import { Box, ButtonBase, Paper, Skeleton, Typography } from '@mui/material';
import { formatShortDate } from '../../utils/dateLabels';

// Matches the Reading Timeline legend: Independent 8-10, Moderate 4-7,
// Needing help 1-3.
export function assessmentLabel(assessment) {
  if (assessment == null) return null;
  if (assessment >= 8) return { text: 'Independent', color: 'status.recentlyRead' };
  if (assessment >= 4) return { text: 'Getting there', color: 'status.needsAttention' };
  return { text: 'Needing help', color: 'status.notRead' };
}

/**
 * The sessions already logged for the selected date and class. Sits under
 * the record form so a volunteer in the reading corner can see who has been
 * done without leaving the page. Tap a row to select that child in the form.
 */
export default function TodaySoFar({
  fetchWithAuth,
  classId,
  date,
  refreshKey = 0,
  onPickStudent,
  students = [],
}) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!date) return undefined;
    const controller = new AbortController();
    setError(false);
    const params = new URLSearchParams({
      classId: classId && classId !== 'all' ? classId : 'all',
      startDate: date,
      endDate: date,
    });
    Promise.resolve()
      .then(() => fetchWithAuth(`/api/students/sessions?${params}`, { signal: controller.signal }))
      .then((r) => (r?.ok ? r.json() : Promise.reject(new Error(`HTTP ${r?.status}`))))
      .then((rows) => {
        if (controller.signal.aborted) return;
        // Only school sessions belong here: home reads arrive via the register
        // and the parent portal, and the register already shows those.
        setSessions((Array.isArray(rows) ? rows : []).filter((s) => s.location !== 'home'));
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setSessions([]);
        setError(true);
      });
    return () => controller.abort();
  }, [fetchWithAuth, classId, date, refreshKey]);

  const isToday = date === new Date().toLocaleDateString('en-CA');
  const heading = isToday ? 'Today so far' : `Logged on ${formatShortDate(date)}`;
  const known = new Set(students.map((s) => s.id));

  return (
    <Paper sx={{ mt: 2, p: 2, borderRadius: '12px' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 700, fontFamily: '"Nunito", sans-serif', color: 'text.primary' }}
        >
          {heading}
        </Typography>
        {sessions && sessions.length > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </Typography>
        )}
      </Box>

      {sessions === null ? (
        <Box>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={44} sx={{ mb: 1, borderRadius: 2 }} />
          ))}
        </Box>
      ) : error ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Couldn&apos;t load the sessions logged so far.
        </Typography>
      ) : sessions.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {isToday
            ? 'Nobody has been read with yet today. The first one lands here.'
            : 'No school sessions were logged on this day.'}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {sessions.map((s) => {
            const label = assessmentLabel(s.assessment);
            const pickable = Boolean(onPickStudent) && known.has(s.studentId);
            const row = (
              <>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {s.studentName}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                    {s.bookTitle || 'No book recorded'}
                  </Typography>
                </Box>
                {label && (
                  <Typography
                    variant="caption"
                    sx={{ color: label.color, fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    {label.text}
                  </Typography>
                )}
              </>
            );
            const sx = {
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              width: '100%',
              textAlign: 'left',
              px: 1,
              py: 0.75,
              minHeight: 48,
              borderRadius: 2,
              borderBottom: '1px solid rgba(139, 115, 85, 0.12)',
              '&:last-of-type': { borderBottom: 'none' },
            };
            return pickable ? (
              <ButtonBase
                key={s.id}
                onClick={() => onPickStudent(s.studentId)}
                aria-label={`Select ${s.studentName}`}
                sx={{ ...sx, '&:hover': { backgroundColor: 'rgba(107, 142, 107, 0.08)' } }}
              >
                {row}
              </ButtonBase>
            ) : (
              <Box key={s.id} sx={sx}>
                {row}
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
