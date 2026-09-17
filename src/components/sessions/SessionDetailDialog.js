import React from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import BookCover from '../BookCover';
import { assessmentLabel } from './TodaySoFar';
import { formatShortDate } from '../../utils/dateLabels';

function Fact({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * Read-only view of one logged session: the book, how it went, and any notes.
 * Opened from a row in "Today so far". Editing still lives on the student's
 * timeline, so this only offers to select the child in the record form.
 */
export default function SessionDetailDialog({
  session,
  open,
  onClose,
  onPickStudent,
  observationItems = [],
}) {
  if (!session) return null;
  const label = assessmentLabel(session.assessment);
  const ticked = observationItems.filter((o) => session[o.key]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, pb: 1 }}>
        {session.studentName}
        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400 }}>
          {formatShortDate(session.date)}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 2 }}>
          {session.bookTitle && (
            <BookCover
              title={session.bookTitle}
              author={session.bookAuthor}
              width={72}
              height={108}
            />
          )}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
              {session.bookTitle || 'No book recorded'}
            </Typography>
            {session.bookAuthor && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {session.bookAuthor}
              </Typography>
            )}
            {label && (
              <Typography variant="body2" sx={{ color: label.color, fontWeight: 700, mt: 1 }}>
                {label.text}
                {session.assessment != null && ` · ${session.assessment}/10`}
              </Typography>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            mb: ticked.length || session.notes ? 2 : 0,
          }}
        >
          <Fact label="Pages">{session.pagesRead}</Fact>
          <Fact label="Minutes">{session.duration}</Fact>
        </Box>

        {ticked.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: session.notes ? 2 : 0 }}>
            {ticked.map((o) => (
              <Chip key={o.key} label={o.label} size="small" color="primary" variant="outlined" />
            ))}
          </Box>
        )}

        {session.notes && (
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Notes
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {session.notes}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {onPickStudent && (
          <Button
            variant="contained"
            onClick={() => {
              onPickStudent(session.studentId);
              onClose();
            }}
          >
            Record for {session.studentName.split(' ')[0]}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
