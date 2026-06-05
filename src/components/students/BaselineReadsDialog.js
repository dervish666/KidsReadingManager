import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Button,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  CircularProgress,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';

/**
 * BaselineReadsDialog — roster table for seeding mid-year "starting reads".
 *
 * A school onboarding partway through the year can type each child's existing
 * read total (from their previous system) one class at a time. Each value seeds
 * the Reading Band volume rank for the current academic year (it does NOT create
 * session rows). Saves go through the bulk endpoint, then a data refresh pulls
 * the recomputed bands back in.
 */
export default function BaselineReadsDialog({ open, onClose, initialClassId }) {
  const { fetchWithAuth } = useAuth();
  const { students, classes, reloadDataFromServer } = useData();

  const activeClasses = useMemo(() => classes.filter((cls) => !cls.disabled), [classes]);
  const hasUnassigned = useMemo(
    () => students.some((s) => !s.classId && s.isActive !== false),
    [students]
  );

  const defaultClassId = useMemo(() => {
    if (initialClassId && initialClassId !== 'all') return initialClassId;
    if (activeClasses.length > 0) return activeClasses[0].id;
    return hasUnassigned ? 'unassigned' : '';
  }, [initialClassId, activeClasses, hasUnassigned]);

  const [selectedClassId, setSelectedClassId] = useState(defaultClassId);
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Re-sync the class selection whenever the dialog is (re)opened.
  React.useEffect(() => {
    if (open) {
      setSelectedClassId(defaultClassId);
      setInputs({});
    }
  }, [open, defaultClassId]);

  const rosterStudents = useMemo(() => {
    const disabledClassIds = new Set(classes.filter((c) => c.disabled).map((c) => c.id));
    return students
      .filter((s) => s.isActive !== false)
      .filter((s) => !(s.classId && disabledClassIds.has(s.classId)))
      .filter((s) =>
        selectedClassId === 'unassigned' ? !s.classId : s.classId === selectedClassId
      )
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, classes, selectedClassId]);

  const displayValue = (s) =>
    inputs[s.id] !== undefined ? inputs[s.id] : s.baselineReads ? String(s.baselineReads) : '';

  const isInvalid = (raw) => {
    if (raw === '' || raw === undefined) return false;
    const n = Number(raw);
    return !Number.isInteger(n) || n < 0 || n > 100000;
  };

  const anyInvalid = rosterStudents.some((s) => isInvalid(displayValue(s)));

  const handleClassChange = (e) => {
    setSelectedClassId(e.target.value);
    setInputs({});
  };

  const handleSave = async () => {
    const updates = [];
    for (const s of rosterStudents) {
      const raw = displayValue(s);
      if (isInvalid(raw)) return;
      const value = raw === '' ? 0 : Math.floor(Number(raw));
      if (value !== (s.baselineReads || 0)) {
        updates.push({ id: s.id, baselineReads: value });
      }
    }

    if (updates.length === 0) {
      setSnackbar({ open: true, message: 'No changes to save', severity: 'info' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/students/baseline-reads/bulk', {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed (${res.status})`);
      }
      await reloadDataFromServer();
      setSnackbar({
        open: true,
        message: `Updated starting reads for ${updates.length} ${updates.length === 1 ? 'student' : 'students'}`,
        severity: 'success',
      });
      setInputs({});
      onClose();
    } catch (e) {
      setSnackbar({ open: true, message: e.message || 'Save failed', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800 }}>
          Starting reads
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2, color: 'text.secondary' }}>
            Joining mid-year? Enter each child's reads already logged this academic year (from your
            previous system) to set their starting Reading Band. This doesn't create reading
            sessions, and it resets each September.
          </DialogContentText>

          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel id="baseline-class-label">Class</InputLabel>
            <Select
              labelId="baseline-class-label"
              value={selectedClassId}
              label="Class"
              onChange={handleClassChange}
            >
              {activeClasses.map((cls) => (
                <MenuItem key={cls.id} value={cls.id}>
                  {cls.teacherName ? `${cls.name} — ${cls.teacherName}` : cls.name}
                </MenuItem>
              ))}
              {hasUnassigned && (
                <MenuItem value="unassigned">
                  <em>Unassigned</em>
                </MenuItem>
              )}
            </Select>
          </FormControl>

          {rosterStudents.length === 0 ? (
            <Alert severity="info">No students in this class.</Alert>
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                maxHeight: 380,
                overflowY: 'auto',
                pr: 0.5,
              }}
            >
              {rosterStudents.map((s) => {
                const raw = displayValue(s);
                const invalid = isInvalid(raw);
                return (
                  <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 0.25 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        flex: 1,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.name}
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      value={raw}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      error={invalid}
                      inputProps={{
                        min: 0,
                        max: 100000,
                        step: 1,
                        'aria-label': `Starting reads for ${s.name}`,
                      }}
                      sx={{ width: 110 }}
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={onClose}
            disabled={saving}
            sx={{ color: 'text.secondary', fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving || anyInvalid || rosterStudents.length === 0}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ borderRadius: 3, fontWeight: 700, px: 3 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
