import React from 'react';
import { Box, Typography, Paper, Button, IconButton, Tooltip, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import BookAutocomplete from './BookAutocomplete';
import { READING_STATUS } from './homeReadingUtils';

/**
 * Left-column "Recording for" panel of the full reading register view.
 * Shows the selected student's current book picker and the quick status
 * buttons (read / 2–4 / custom / absent / no record). Collapsible on mobile.
 *
 * @param {object} props
 * @param {boolean} props.isMobile - Mobile breakpoint flag (enables collapse toggle)
 * @param {object|null} props.selectedStudent - Currently selected student, or null
 * @param {boolean} props.showInputPanel - Whether the panel body is expanded (mobile)
 * @param {Function} props.onShowInputPanelChange - Toggle the panel body
 * @param {Function} props.getStudentLastBook - (studentId) => current book or null
 * @param {Function} props.onBookChange - Called with the newly selected book
 * @param {Function} props.onRecordReading - (status, count?) records a session
 * @param {Function} props.onMultipleClick - Opens the custom day-count dialog
 * @param {boolean} props.isRecording - Disables buttons while a record is in flight
 */
const ReadingInputPanel = ({
  isMobile,
  selectedStudent,
  showInputPanel,
  onShowInputPanelChange,
  getStudentLastBook,
  onBookChange,
  onRecordReading,
  onMultipleClick,
  isRecording,
}) => {
  return (
    <Paper sx={{ p: 2, flex: isMobile ? 'none' : 1 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: isMobile ? 'pointer' : 'default',
        }}
        onClick={() => isMobile && onShowInputPanelChange(!showInputPanel)}
      >
        <Typography variant="h6">
          {selectedStudent
            ? `Recording for: ${selectedStudent.name}`
            : 'Select a student from the register'}
        </Typography>
        {isMobile && (
          <IconButton size="small">
            {showInputPanel ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        )}
      </Box>

      <Collapse in={showInputPanel || !isMobile}>
        {selectedStudent ? (
          <Box sx={{ mt: 2 }}>
            {/* Book Selection */}
            <Box sx={{ mb: 2 }}>
              <BookAutocomplete
                value={getStudentLastBook(selectedStudent.id)}
                onChange={onBookChange}
                label="Current Book"
                placeholder="Select or search for book..."
              />
              <Typography variant="caption" color="text.secondary">
                Book will be saved and synced across devices
              </Typography>
            </Box>

            {/* Quick Input Buttons */}
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <Tooltip title="Read (✓)">
                <Button
                  variant="contained"
                  color="success"
                  size="large"
                  aria-label="Mark as read"
                  disabled={isRecording}
                  onClick={() => onRecordReading(READING_STATUS.READ)}
                  sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                >
                  ✓
                </Button>
              </Tooltip>

              <Tooltip title="Read 2 times">
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  aria-label="Read 2 times"
                  disabled={isRecording}
                  onClick={() => onRecordReading(READING_STATUS.MULTIPLE, 2)}
                  sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                >
                  2
                </Button>
              </Tooltip>

              <Tooltip title="Read 3 times">
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  aria-label="Read 3 times"
                  disabled={isRecording}
                  onClick={() => onRecordReading(READING_STATUS.MULTIPLE, 3)}
                  sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                >
                  3
                </Button>
              </Tooltip>

              <Tooltip title="Read 4 times">
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  aria-label="Read 4 times"
                  disabled={isRecording}
                  onClick={() => onRecordReading(READING_STATUS.MULTIPLE, 4)}
                  sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                >
                  4
                </Button>
              </Tooltip>

              <Tooltip title="Custom number of sessions">
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  aria-label="Custom number of reading sessions"
                  disabled={isRecording}
                  onClick={onMultipleClick}
                  sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                >
                  +
                </Button>
              </Tooltip>

              <Tooltip title="Absent (A)">
                <Button
                  variant="contained"
                  color="warning"
                  size="large"
                  aria-label="Mark as absent"
                  disabled={isRecording}
                  onClick={() => onRecordReading(READING_STATUS.ABSENT)}
                  sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                >
                  A
                </Button>
              </Tooltip>

              <Tooltip title="No Record (•)">
                <Button
                  variant="outlined"
                  color="inherit"
                  size="large"
                  aria-label="No reading record"
                  disabled={isRecording}
                  onClick={() => onRecordReading(READING_STATUS.NO_RECORD)}
                  sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                >
                  •
                </Button>
              </Tooltip>
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
            Click on a student in the register below to record their reading
          </Typography>
        )}
      </Collapse>
    </Paper>
  );
};

export default ReadingInputPanel;
