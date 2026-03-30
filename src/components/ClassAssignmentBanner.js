import { useState } from 'react';
import { Alert, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../contexts/AuthContext';

const hasNoClasses = (user) =>
  !user?.assignedClassIds || user.assignedClassIds.length === 0;

export default function ClassAssignmentBanner() {
  const { user } = useAuth();

  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('classAssignmentBannerDismissed') === 'true';
    } catch {
      return false;
    }
  });

  if (!user || user.role !== 'teacher' || !hasNoClasses(user) || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('classAssignmentBannerDismissed', 'true');
    } catch {
      // ignore
    }
  };

  return (
    <Alert
      severity="warning"
      sx={{ mb: 2 }}
      action={
        <IconButton
          aria-label="close"
          color="inherit"
          size="small"
          onClick={handleDismiss}
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      }
    >
      Your classes haven&apos;t been linked yet — this usually resolves overnight, or ask your school
      administrator.
    </Alert>
  );
}
