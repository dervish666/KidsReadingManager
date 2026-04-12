import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Link,
  Alert,
} from '@mui/material';

export default function ClassGoalsEditor({ open, onClose, classId, goals, onSave, fetchWithAuth }) {
  const [targets, setTargets] = useState(() => {
    const map = {};
    goals.forEach((g) => {
      map[g.metric] = g.target;
    });
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetchWithAuth(`/api/classes/${classId}/goals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals: Object.entries(targets).map(([metric, target]) => ({
            metric,
            target: Number(target),
          })),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        onSave(data);
      } else {
        setError('Failed to save goals. Please try again.');
      }
    } catch {
      setError('Failed to save goals. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    try {
      const response = await fetchWithAuth(`/api/classes/${classId}/students`);
      const students = response.ok ? await response.json() : [];
      const size = Array.isArray(students) ? students.length : 0;
      setTargets({
        sessions: size * 20,
        genres: 10,
        books: size * 4,
        reading_days: 30,
        readers: size,
        badges: size,
      });
    } catch {
      // Silently fail — teacher can set manually
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: '16px' } }}
    >
      <DialogTitle sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
        Edit Class Goals
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Active Readers Target"
            helperText="Students who've read at least once this term"
            type="number"
            value={targets.readers || ''}
            onChange={(e) => setTargets((t) => ({ ...t, readers: e.target.value }))}
            inputProps={{ min: 1 }}
          />
          <TextField
            label="Reading Days Target"
            helperText="Different days the class has had a reading session"
            type="number"
            value={targets.reading_days || ''}
            onChange={(e) => setTargets((t) => ({ ...t, reading_days: e.target.value }))}
            inputProps={{ min: 1 }}
          />
          <TextField
            label="Reading Sessions Target"
            helperText="Total reading sessions across all students"
            type="number"
            value={targets.sessions || ''}
            onChange={(e) => setTargets((t) => ({ ...t, sessions: e.target.value }))}
            inputProps={{ min: 1 }}
          />
          <TextField
            label="Badges Earned Target"
            helperText="Total badges collected by the whole class"
            type="number"
            value={targets.badges || ''}
            onChange={(e) => setTargets((t) => ({ ...t, badges: e.target.value }))}
            inputProps={{ min: 1 }}
          />
          <TextField
            label="Genres Explored Target"
            helperText="Different genres the class has read across"
            type="number"
            value={targets.genres || ''}
            onChange={(e) => setTargets((t) => ({ ...t, genres: e.target.value }))}
            inputProps={{ min: 1 }}
          />
          <TextField
            label="Unique Books Target"
            helperText="Different books the class has read"
            type="number"
            value={targets.books || ''}
            onChange={(e) => setTargets((t) => ({ ...t, books: e.target.value }))}
            inputProps={{ min: 1 }}
          />
          <Link
            component="button"
            variant="body2"
            onClick={handleResetDefaults}
            sx={{ alignSelf: 'flex-start' }}
          >
            Reset to defaults
          </Link>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} sx={{ borderRadius: 2 }}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
