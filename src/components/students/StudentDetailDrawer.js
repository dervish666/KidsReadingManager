import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Chip,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Snackbar,
} from '@mui/material';
import { Close as CloseIcon, Edit as EditIcon, Save as SaveIcon } from '@mui/icons-material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { calculateAge } from '../../utils/calculateAge';
import StreakBadge from './StreakBadge';
import StudentReadView from './StudentReadView';
import StudentEditForm from './StudentEditForm';
import StudentTimeline from './StudentTimeline';
import BadgeCollection from '../badges/BadgeCollection';
import { BADGE_DEFINITIONS } from '../../utils/badgeDefinitions';

const BADGE_MAP = Object.fromEntries(BADGE_DEFINITIONS.map((b) => [b.id, b]));

/**
 * StudentDetailDrawer — right-anchored drawer combining student header,
 * read/edit sidebar, and reading session timeline.
 *
 * Props:
 *   open      {boolean}   Whether the drawer is visible
 *   student   {Object}    Student from AppContext list (used as initial/fallback)
 *   onClose   {Function}  Called when the drawer should close
 */
const StudentDetailDrawer = ({ open, student, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { fetchWithAuth } = useAuth();
  const { classes, updateStudent } = useData();

  // ── State ──────────────────────────────────────────────────────────────────
  const [fullStudent, setFullStudent] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('read');
  const [saving, setSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState(0);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  const editFormRef = useRef(null);

  // ── Derived values ─────────────────────────────────────────────────────────
  const displayStudent = fullStudent || student;

  const className = useMemo(() => {
    if (!displayStudent?.classId) return null;
    const cls = classes.find((c) => c.id === displayStudent.classId);
    return cls?.name || null;
  }, [displayStudent?.classId, classes]);

  const age = useMemo(() => {
    return calculateAge(displayStudent?.dateOfBirth);
  }, [displayStudent?.dateOfBirth]);

  const readingLevelLabel = useMemo(() => {
    const min = displayStudent?.readingLevelMin;
    const max = displayStudent?.readingLevelMax;
    if (min == null && max == null) return null;
    if (min != null && max != null) return `AR ${min}–${max}`;
    if (min != null) return `AR ${min}+`;
    return `AR up to ${max}`;
  }, [displayStudent?.readingLevelMin, displayStudent?.readingLevelMax]);

  const isProcessingRestricted = Boolean(displayStudent?.processingRestricted);

  // ── Fetch full student on open ─────────────────────────────────────────────
  const fetchFullStudent = useCallback(
    async (signal) => {
      if (!student?.id) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetchWithAuth(`/api/students/${student.id}`, { signal });
        if (!response.ok) {
          throw new Error('Could not load student data');
        }
        const data = await response.json();
        setFullStudent(data);
        setSessions(data.readingSessions || []);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError('Could not load student details. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [student?.id, fetchWithAuth]
  );

  useEffect(() => {
    if (!open) {
      // Reset state when drawer closes
      setFullStudent(null);
      setSessions([]);
      setLoading(false);
      setError(null);
      setMode('read');
      setSaving(false);
      return;
    }

    const controller = new AbortController();
    fetchFullStudent(controller.signal);

    return () => {
      controller.abort();
    };
  }, [open, fetchFullStudent]);

  // ── Session change callback (re-fetch sessions) ────────────────────────────
  const handleSessionChange = useCallback(async () => {
    if (!student?.id) return;
    try {
      const response = await fetchWithAuth(`/api/students/${student.id}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.readingSessions || []);
        setFullStudent(data);
      }
    } catch {
      // Silently ignore
    }
  }, [student?.id, fetchWithAuth]);

  // ── Edit / Save / Cancel handlers ─────────────────────────────────────────
  const handleEditClick = () => {
    setMode('edit');
  };

  const handleSaveFormData = useCallback(
    async (formData) => {
      if (!student?.id) return;
      setSaving(true);
      try {
        await updateStudent(student.id, formData);
        // Re-fetch to get fresh full data
        const response = await fetchWithAuth(`/api/students/${student.id}`);
        if (response.ok) {
          const data = await response.json();
          setFullStudent(data);
          setSessions(data.readingSessions || []);
        }
        setMode('read');
        setSnackbarMessage('Student updated successfully');
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } catch (err) {
        setSnackbarMessage('Failed to save changes');
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      } finally {
        setSaving(false);
      }
    },
    [student?.id, updateStudent, fetchWithAuth]
  );

  const handleSaveClick = () => {
    if (editFormRef.current) {
      editFormRef.current.save();
    }
  };

  const handleCancelClick = () => {
    if (editFormRef.current) {
      editFormRef.current.cancel();
    }
  };

  const handleFormCancel = useCallback(() => {
    setMode('read');
  }, []);

  const handleClose = () => {
    onClose?.();
  };

  // ── Header bar ─────────────────────────────────────────────────────────────
  const renderHeader = () => (
    <Box
      sx={{
        px: 2.5,
        pt: 2,
        pb: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'rgba(250, 248, 243, 0.8)',
        flexShrink: 0,
      }}
    >
      {/* Row 1: Name, chips, actions */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'nowrap',
          mb: 0.75,
        }}
      >
        {/* Student name */}
        <Typography
          variant="h6"
          noWrap
          sx={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'text.primary' }}
        >
          {displayStudent?.name || ''}
        </Typography>

        {/* Class chip */}
        {className && (
          <Chip
            label={className}
            size="small"
            sx={{
              bgcolor: 'rgba(139, 115, 85, 0.12)',
              color: 'secondary.dark',
              fontWeight: 500,
              flexShrink: 0,
            }}
          />
        )}

        {/* Streak badge */}
        {(displayStudent?.currentStreak ?? 0) > 0 && (
          <StreakBadge streak={displayStudent.currentStreak} size="small" />
        )}

        {/* Restricted chip */}
        {isProcessingRestricted && (
          <Chip
            label="Restricted"
            size="small"
            sx={{
              bgcolor: 'rgba(158, 75, 75, 0.1)',
              color: 'status.notRead',
              fontWeight: 500,
              flexShrink: 0,
            }}
          />
        )}

        {/* Edit / Save / Cancel buttons */}
        {!isProcessingRestricted && mode === 'read' && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={handleEditClick}
            sx={{
              flexShrink: 0,
              borderColor: 'primary.main',
              color: 'primary.main',
              '&:hover': { borderColor: 'primary.dark', bgcolor: 'rgba(107,142,107,0.06)' },
            }}
          >
            Edit
          </Button>
        )}
        {mode === 'edit' && (
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <Button size="small" variant="outlined" onClick={handleCancelClick} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              onClick={handleSaveClick}
              disabled={saving}
              sx={{
                bgcolor: 'primary.main',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              Save
            </Button>
          </Box>
        )}

        {/* Close button */}
        <IconButton size="small" onClick={handleClose} aria-label="Close drawer">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Row 2: Demographic chips */}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', minHeight: 24 }}>
        {/* Age */}
        {age != null && (
          <Chip
            label={`${age} years`}
            size="small"
            sx={{
              bgcolor: 'rgba(107, 142, 107, 0.1)',
              color: 'primary.main',
              height: 22,
              fontSize: '0.7rem',
            }}
          />
        )}

        {/* Gender */}
        {displayStudent?.gender && (
          <Chip
            label={
              displayStudent.gender.charAt(0).toUpperCase() +
              displayStudent.gender.slice(1).toLowerCase()
            }
            size="small"
            sx={{
              bgcolor: 'rgba(107, 142, 107, 0.1)',
              color: 'primary.main',
              height: 22,
              fontSize: '0.7rem',
            }}
          />
        )}

        {/* Year group */}
        {displayStudent?.yearGroup && (
          <Chip
            label={`Year ${displayStudent.yearGroup}`}
            size="small"
            sx={{
              bgcolor: 'rgba(107, 142, 107, 0.1)',
              color: 'primary.main',
              height: 22,
              fontSize: '0.7rem',
            }}
          />
        )}

        {/* Reading level range */}
        {readingLevelLabel && (
          <Chip
            label={readingLevelLabel}
            size="small"
            sx={{
              bgcolor: 'rgba(122, 158, 173, 0.12)',
              color: 'info.main',
              height: 22,
              fontSize: '0.7rem',
            }}
          />
        )}

        {/* First language (only if not English) */}
        {displayStudent?.firstLanguage &&
          displayStudent.firstLanguage.toLowerCase() !== 'english' && (
            <Chip
              label={displayStudent.firstLanguage}
              size="small"
              sx={{
                bgcolor: 'rgba(107, 142, 107, 0.1)',
                color: 'primary.main',
                height: 22,
                fontSize: '0.7rem',
              }}
            />
          )}

        {/* EAL status (only if not 'Not applicable') */}
        {displayStudent?.ealDetailedStatus &&
          displayStudent.ealDetailedStatus.toLowerCase() !== 'not applicable' && (
            <Chip
              label={displayStudent.ealDetailedStatus}
              size="small"
              sx={{
                bgcolor: 'rgba(155, 110, 58, 0.1)',
                color: 'status.needsAttention',
                height: 22,
                fontSize: '0.7rem',
              }}
            />
          )}
      </Box>
    </Box>
  );

  // ── Sidebar (read or edit) ─────────────────────────────────────────────────
  const renderSidebar = () => {
    if (loading && !fullStudent) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      );
    }

    if (mode === 'edit') {
      return (
        <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
          <StudentEditForm
            ref={editFormRef}
            student={fullStudent || student}
            onSave={handleSaveFormData}
            onCancel={handleFormCancel}
          />
        </Box>
      );
    }

    return (
      <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
        <StudentReadView student={fullStudent || student} sessions={sessions} />
        {fullStudent && (
          <BadgeCollection
            studentName={fullStudent.name?.split(' ')[0]}
            badges={(fullStudent.badges || []).map((b) => {
              const def = BADGE_MAP[b.badgeId];
              return {
                ...b,
                name: def?.name || b.badgeId,
                icon: def?.icon || 'bookworm',
                description: def?.description,
              };
            })}
            nearMisses={fullStudent.nearMisses || []}
            stats={fullStudent.readingStats}
          />
        )}
      </Box>
    );
  };

  // ── Timeline column ────────────────────────────────────────────────────────
  const renderTimeline = () => (
    <Box sx={{ overflow: 'auto', flex: 1, p: 2 }}>
      <StudentTimeline
        sessions={sessions}
        loading={loading && !fullStudent}
        studentId={student?.id}
        onSessionChange={handleSessionChange}
      />
    </Box>
  );

  // ── Desktop layout ─────────────────────────────────────────────────────────
  const renderDesktopContent = () => (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left sidebar — 30% */}
      <Box
        sx={{
          width: '30%',
          minWidth: 220,
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {renderSidebar()}
      </Box>

      {/* Right timeline — 70% */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 2, pt: 2, pb: 0.5, flexShrink: 0 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Reading Sessions
          </Typography>
        </Box>
        {renderTimeline()}
      </Box>
    </Box>
  );

  // ── Mobile layout ──────────────────────────────────────────────────────────
  const renderMobileContent = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <Tabs
        value={mobileTab}
        onChange={(_, val) => setMobileTab(val)}
        sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
      >
        <Tab label="Details" />
        <Tab label="Sessions" />
      </Tabs>

      {mobileTab === 0 && (
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {renderSidebar()}
        </Box>
      )}

      {mobileTab === 1 && (
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {renderTimeline()}
        </Box>
      )}
    </Box>
  );

  // ── Drawer ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Drawer
        anchor="right"
        variant="temporary"
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: '100%', md: 800, lg: 900 },
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {renderHeader()}

        {isMobile ? renderMobileContent() : renderDesktopContent()}
      </Drawer>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default StudentDetailDrawer;
