import React, { useMemo } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { resolveTeacherClasses, summariseClass } from '../utils/classOverview';

const ROLE_LABEL = {
  owner: 'Owner',
  admin: 'Administrator',
  teacher: 'Teacher',
  readonly: 'Read only',
};

const PROVIDER_LABEL = {
  mylogin: 'MyLogin (school single sign-on)',
  local: 'Email and password',
  demo: 'Demo account',
};

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function formatWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso.includes('T') || iso.includes(' ') ? iso.replace(' ', 'T') + 'Z' : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Stat({ value, label, tone }) {
  const colours = {
    good: { bg: 'rgba(107, 142, 107, 0.12)', fg: '#4E6B4E' },
    warn: { bg: 'rgba(212, 163, 82, 0.16)', fg: '#8A6420' },
    bad: { bg: 'rgba(196, 112, 96, 0.14)', fg: '#8E4A3E' },
    plain: { bg: 'rgba(0,0,0,0.04)', fg: 'text.primary' },
  }[tone || 'plain'];
  return (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 92,
        px: 1.5,
        py: 1.25,
        borderRadius: '12px',
        backgroundColor: colours.bg,
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.1, color: colours.fg }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary', mt: 0.25 }}>
        {label}
      </Typography>
    </Box>
  );
}

function ClassCard({ cls, summary, onView }) {
  const teacherNames = [...new Set([cls.teacherName, ...(cls.teacherNames || [])].filter(Boolean))];
  const notRead = summary.status.overdue + summary.status.never;
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: '14px',
        border: '1px solid rgba(107, 142, 107, 0.18)',
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
            {cls.name}
            {cls.yearGroup ? (
              <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 600, ml: 1 }}>
                Year {cls.yearGroup}
              </Typography>
            ) : null}
          </Typography>
          {teacherNames.length > 0 && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {teacherNames.join(', ')}
            </Typography>
          )}
        </Box>
        <Button size="small" onClick={() => onView(cls.id)} sx={{ flexShrink: 0 }}>
          View class
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Stat value={summary.pupils} label="pupils" />
        <Stat value={summary.readToday} label="read today" tone="good" />
        <Stat value={summary.readThisWeek} label="read this week" tone="good" />
        <Stat value={summary.status.attention} label="needs attention" tone="warn" />
        <Stat value={notRead} label="not read" tone="bad" />
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          icon={<LocalFireDepartmentOutlinedIcon sx={{ fontSize: 16 }} />}
          label={
            summary.activeStreaks === 0
              ? 'No streaks running'
              : `${summary.activeStreaks} streak${summary.activeStreaks === 1 ? '' : 's'} running`
          }
          sx={{ backgroundColor: 'rgba(212, 163, 82, 0.14)', fontWeight: 600 }}
        />
        {summary.longestStreak && (
          <Typography variant="caption" color="text.secondary">
            Longest: {summary.longestStreak.name}, {summary.longestStreak.days} day
            {summary.longestStreak.days === 1 ? '' : 's'}
          </Typography>
        )}
      </Stack>

      {summary.catchUp.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Worth catching up with
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.25 }}>
            {summary.catchUp
              .map((p) => (p.days === null ? `${p.name} (never)` : `${p.name} (${p.days}d)`))
              .join(' · ')}
            {summary.catchUpTotal > summary.catchUp.length
              ? ` and ${summary.catchUpTotal - summary.catchUp.length} more`
              : ''}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/**
 * Opened from the signed-in name chip in the header: who is signed in, and a
 * glance at the class or classes they teach. Reads DataContext only, so it
 * costs no request and is always in step with the rest of the app.
 *
 * Class resolution is in utils/classOverview.js. When nothing links the user
 * to a class (an admin, an owner, a teacher whose MIS link hasn't synced yet)
 * the dialog shows the currently selected class instead, and says so.
 */
export default function TeacherOverviewDialog({ open, onClose }) {
  const { user } = useAuth();
  const { students, classes } = useData();
  const { globalClassFilter, setGlobalClassFilter, getReadingStatus } = useUI();

  const resolved = useMemo(() => resolveTeacherClasses(user, classes), [user, classes]);

  const shown = useMemo(() => {
    if (resolved.classes.length > 0) return resolved;
    const selected = (classes || []).find((c) => c.id === globalClassFilter);
    return selected ? { classes: [selected], via: 'selected' } : { classes: [], via: 'none' };
  }, [resolved, classes, globalClassFilter]);

  const summaries = useMemo(
    () =>
      shown.classes.map((cls) => ({
        cls,
        summary: summariseClass({ students, classId: cls.id, getReadingStatus }),
      })),
    [shown, students, getReadingStatus]
  );

  const handleView = (classId) => {
    setGlobalClassFilter(classId);
    onClose?.();
  };

  const lastLogin = formatWhen(user?.lastLoginAt);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="teacher-overview-title"
      PaperProps={{ sx: { borderRadius: '16px', backgroundColor: '#FDFCF9' } }}
    >
      <DialogTitle
        id="teacher-overview-title"
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 6 }}
      >
        <Avatar
          sx={{
            bgcolor: 'primary.main',
            color: '#fff',
            fontWeight: 800,
            width: 44,
            height: 44,
            fontSize: '1rem',
          }}
        >
          {initials(user?.name) || '?'}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2 }} noWrap>
            {user?.name || 'Signed in'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {ROLE_LABEL[user?.role] || user?.role || ''}
            {user?.organizationName ? ` · ${user.organizationName}` : ''}
          </Typography>
        </Box>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        <Stack spacing={0.75} sx={{ mb: 2 }}>
          {user?.email && !user.email.endsWith('@no-email.invalid') && (
            <Stack direction="row" spacing={1} alignItems="center">
              <MailOutlineIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="body2" noWrap>
                {user.email}
              </Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={1} alignItems="center">
            <SchoolOutlined sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">
              {PROVIDER_LABEL[user?.authProvider] || 'Signed in'}
              {lastLogin ? ` · last sign-in ${lastLogin}` : ''}
            </Typography>
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.secondary', mb: 1 }}>
          {shown.via === 'assigned' || shown.via === 'name'
            ? shown.classes.length === 1
              ? 'Your class'
              : 'Your classes'
            : shown.via === 'selected'
              ? 'Selected class'
              : 'Class'}
        </Typography>

        {shown.via === 'selected' && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            No class is linked to your account yet, so this is the class currently selected in the
            header.
          </Typography>
        )}

        {summaries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No class is linked to your account and none is selected. Pick a class from the dropdown
            in the header to see its overview here.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {summaries.map(({ cls, summary }) => (
              <ClassCard key={cls.id} cls={cls} summary={summary} onView={handleView} />
            ))}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="contained" sx={{ borderRadius: '10px' }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
