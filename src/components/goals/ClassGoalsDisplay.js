import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, Box, Typography, IconButton, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import GardenHeader from '../badges/GardenHeader';

const CONFETTI_EMOJIS = ['🌸', '✨', '🎉', '🌟', '📚', '🌿'];

const METRIC_CONFIG = {
  sessions: {
    label: 'Reading Sessions',
    gradient: 'linear-gradient(90deg, #8AAD8A, #6B8E6B)',
    icon: '📖',
  },
  genres: {
    label: 'Genres Explored',
    gradient: 'linear-gradient(90deg, #C4956A, #A67B50)',
    icon: '🎨',
  },
  books: {
    label: 'Unique Books',
    gradient: 'linear-gradient(90deg, #7BA1C7, #5A86B0)',
    icon: '📚',
  },
};

const METRIC_ORDER = ['sessions', 'genres', 'books'];

function ConfettiPiece({ emoji, style }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'fixed',
        fontSize: 28,
        pointerEvents: 'none',
        animation: 'confettiFall 3s ease-in forwards',
        ...style,
      }}
    >
      {emoji}
    </span>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    emoji: CONFETTI_EMOJIS[i % CONFETTI_EMOJIS.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 1.5}s`,
    duration: `${2.5 + Math.random() * 1.5}s`,
  }));

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-60px) rotate(0deg) scale(1);   opacity: 1; }
          60%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg) scale(0.6); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <ConfettiPiece
          key={p.id}
          emoji={p.emoji}
          style={{
            left: p.left,
            top: '-40px',
            animationDelay: p.delay,
            animationDuration: p.duration,
            zIndex: 9999,
          }}
        />
      ))}
    </>
  );
}

function ProgressBar({ goal }) {
  const config = METRIC_CONFIG[goal.metric] || {
    label: goal.metric,
    gradient: 'linear-gradient(90deg, #8AAD8A, #6B8E6B)',
    icon: '📌',
  };

  const pct = goal.target > 0 ? Math.min((goal.current / goal.target) * 100, 100) : 0;
  const achieved = goal.current >= goal.target;

  return (
    <Box sx={{ mb: 3 }}>
      {/* Label row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            sx={{
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            {config.icon}
          </Typography>
          <Typography
            sx={{
              color: '#B8A88A',
              fontSize: 18,
              fontWeight: 600,
              fontFamily: '"Nunito", "DM Sans", sans-serif',
            }}
          >
            {config.label}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {achieved && (
            <Chip
              label="Goal reached!"
              size="small"
              sx={{
                background: '#4A7A4A',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: 13,
                fontFamily: '"Nunito", "DM Sans", sans-serif',
                height: 28,
              }}
            />
          )}
          <Typography
            sx={{
              color: '#FFFEF9',
              fontSize: 24,
              fontWeight: 800,
              fontFamily: '"Nunito", "DM Sans", sans-serif',
              minWidth: 100,
              textAlign: 'right',
            }}
          >
            {goal.current} / {goal.target}
          </Typography>
        </Box>
      </Box>

      {/* Track */}
      <Box
        sx={{
          background: '#4A4538',
          borderRadius: 10,
          height: 20,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            background: config.gradient,
            borderRadius: 10,
            height: '100%',
            width: `${pct}%`,
            transition: 'width 0.6s ease',
          }}
        />
      </Box>
    </Box>
  );
}

export default function ClassGoalsDisplay({ open, onClose, classId, fetchWithAuth }) {
  const [data, setData] = useState(null);
  const [className, setClassName] = useState('');
  const hasCelebrated = useRef(false);

  const loadData = useCallback(() => {
    fetchWithAuth(`/api/classes/${classId}/goals`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => {});
  }, [classId, fetchWithAuth]);

  // Fetch class name separately if not available from goals response
  useEffect(() => {
    if (!open || !classId) return;
    fetchWithAuth(`/api/classes/${classId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((cls) => {
        if (cls && cls.name) setClassName(cls.name);
      })
      .catch(() => {});
  }, [open, classId, fetchWithAuth]);

  useEffect(() => {
    if (!open) return;
    hasCelebrated.current = false;
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [open, loadData]);

  // Determine if any goal was recently achieved (within last 24 hours)
  const showConfetti =
    data &&
    !hasCelebrated.current &&
    data.goals &&
    data.goals.some((g) => {
      if (!g.achievedAt) return false;
      const elapsed = Date.now() - new Date(g.achievedAt).getTime();
      return elapsed < 24 * 60 * 60 * 1000;
    });

  if (showConfetti) {
    hasCelebrated.current = true;
  }

  const termLabel = data?.term || '';
  const gardenStage = data?.gardenStage || 'seedling';

  // Sort goals by canonical order
  const sortedGoals = data?.goals
    ? [...data.goals].sort(
        (a, b) => METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric)
      )
    : [];

  const displayName = className || 'Class';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #2D2A24, #3D3427)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      {showConfetti && <Confetti />}

      {/* Close button */}
      <IconButton
        onClick={onClose}
        aria-label="Close display"
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          color: '#B8A88A',
          zIndex: 10,
          background: 'rgba(0,0,0,0.3)',
          '&:hover': { background: 'rgba(0,0,0,0.5)', color: '#FFFEF9' },
        }}
      >
        <CloseIcon sx={{ fontSize: 28 }} />
      </IconButton>

      {/* Main content — vertically centred */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: { xs: 3, sm: 6, md: 10 },
          py: 4,
          maxWidth: 900,
          width: '100%',
          mx: 'auto',
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography
            sx={{
              color: '#FFFEF9',
              fontSize: { xs: 28, sm: 36, md: 42 },
              fontWeight: 800,
              fontFamily: '"Nunito", "DM Sans", sans-serif',
              lineHeight: 1.1,
            }}
          >
            {displayName}
          </Typography>
          {termLabel && (
            <Typography
              sx={{
                color: '#B8A88A',
                fontSize: { xs: 16, sm: 18 },
                fontWeight: 600,
                fontFamily: '"Nunito", "DM Sans", sans-serif',
                mt: 0.5,
              }}
            >
              {termLabel}
            </Typography>
          )}
        </Box>

        {/* Garden */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #3D4A2D, #2D3A20)',
            borderRadius: 3,
            overflow: 'hidden',
            mb: 4,
          }}
        >
          <GardenHeader stage={gardenStage} label={`${displayName}'s Reading Garden`} />
        </Box>

        {/* Progress bars */}
        {data ? (
          <Box>
            {sortedGoals.map((goal) => (
              <ProgressBar key={goal.id ?? goal.metric} goal={goal} />
            ))}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography
              sx={{
                color: '#B8A88A',
                fontFamily: '"Nunito", "DM Sans", sans-serif',
                fontSize: 18,
              }}
            >
              Loading goals…
            </Typography>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box
        component="footer"
        sx={{ textAlign: 'center', pb: 2, pt: 1 }}
      >
        <Typography
          sx={{
            color: '#6B6050',
            fontSize: 13,
            fontFamily: '"Nunito", "DM Sans", sans-serif',
          }}
        >
          Press Escape to close
        </Typography>
      </Box>
    </Dialog>
  );
}
