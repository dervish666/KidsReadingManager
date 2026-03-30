import { useState, useMemo } from 'react';
import { Dialog, DialogContent, Box, Typography, Button } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import TallyLogo from './TallyLogo';

const WELCOME_VERSION = 1;

export default function WelcomeDialog() {
  const { user } = useAuth();
  const { classes, students, loading } = useData();
  const { completedTours, markTourComplete } = useUI();
  const [open, setOpen] = useState(true);

  const hasClasses = user?.assignedClassIds?.length > 0;

  const classInfo = useMemo(() => {
    if (!hasClasses || !classes.length) return null;
    const assignedClasses = classes
      .filter((c) => user.assignedClassIds.includes(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!assignedClasses.length) return null;
    const first = assignedClasses[0];
    const studentCount = students.filter((s) => s.classId === first.id).length;
    const othersCount = assignedClasses.length - 1;
    return { name: first.name, studentCount, othersCount };
  }, [hasClasses, classes, students, user?.assignedClassIds]);

  // Only show for teachers (readonly onboarding is a non-goal per spec)
  if (loading || completedTours.welcome || !user || user.role !== 'teacher' || !open) {
    return null;
  }

  const handleGetStarted = () => {
    markTourComplete('welcome', WELCOME_VERSION);
    setOpen(false);
  };

  return (
    <Dialog open maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px', p: 0 } }}>
      <DialogContent sx={{ textAlign: 'center', p: { xs: 3, sm: 5 }, pt: { xs: 4, sm: 5 } }}>
        {/* Logo */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #8AAD8A, #6B8E6B)',
            width: 56,
            height: 56,
            borderRadius: '14px',
            mx: 'auto',
            mb: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(107, 142, 107, 0.35)',
          }}
        >
          <TallyLogo size={28} />
        </Box>

        <Typography
          variant="h5"
          sx={{
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            color: 'text.primary',
            mb: 0.5,
          }}
        >
          Welcome to Tally Reading!
        </Typography>

        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          Hello {user.name} &mdash; {hasClasses ? "you're all set up." : 'nearly there.'}
        </Typography>

        {/* Class info or warning card */}
        {hasClasses && classInfo ? (
          <Box
            sx={{
              background: 'rgba(107, 142, 107, 0.08)',
              border: '1px solid rgba(107, 142, 107, 0.2)',
              borderRadius: '12px',
              p: 2,
              mb: 3,
              textAlign: 'left',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: '1.2rem' }}>🏫</Typography>
              <Typography
                sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}
              >
                {classInfo.name}
              </Typography>
              {classInfo.othersCount > 0 && (
                <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                  (and {classInfo.othersCount} other{classInfo.othersCount > 1 ? 's' : ''})
                </Typography>
              )}
              <Box
                sx={{
                  background: 'rgba(107, 142, 107, 0.15)',
                  color: 'primary.main',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  px: 1,
                  py: 0.25,
                  borderRadius: '6px',
                  ml: 'auto',
                }}
              >
                {classInfo.studentCount} student{classInfo.studentCount !== 1 ? 's' : ''}
              </Box>
            </Box>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
              Your class filter has been set automatically. You can change it any time from the
              header.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              background: 'rgba(210, 160, 60, 0.08)',
              border: '1px solid rgba(210, 160, 60, 0.25)',
              borderRadius: '12px',
              p: 2,
              mb: 3,
              textAlign: 'left',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: '1.2rem' }}>&#x26A0;&#xFE0F;</Typography>
              <Typography
                sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}
              >
                No classes linked yet
              </Typography>
            </Box>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem', mb: 1 }}>
              Your classes haven&apos;t been connected to your account yet. This usually resolves
              automatically overnight, or your school administrator can set it up.
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
              In the meantime, you can browse all students in the school.
            </Typography>
          </Box>
        )}

        {/* What you can do */}
        <Box sx={{ textAlign: 'left', mb: 3.5 }}>
          <Typography
            sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.85rem', mb: 1.5 }}
          >
            Here&apos;s what you can do:
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              ['\uD83D\uDCD6', 'Record school and home reading sessions'],
              ['\uD83D\uDCCA', 'Track progress with reading stats'],
              ['\uD83D\uDCA1', 'Get personalised book recommendations'],
            ].map(([icon, text]) => (
              <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Typography sx={{ fontSize: '1rem' }}>{icon}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                  {text}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={handleGetStarted}
          sx={{
            height: 48,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #8AAD8A, #6B8E6B)',
            boxShadow: '0 6px 20px rgba(107, 142, 107, 0.35)',
            fontSize: '1rem',
            fontWeight: 700,
            textTransform: 'none',
          }}
        >
          Get Started
        </Button>
      </DialogContent>
    </Dialog>
  );
}
