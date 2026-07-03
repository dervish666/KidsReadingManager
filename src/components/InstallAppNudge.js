import { useEffect, useState } from 'react';
import { Alert, Button, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import IosShareIcon from '@mui/icons-material/IosShare';

const DISMISS_KEY = 'installNudgeDismissed';

// Chrome can fire beforeinstallprompt before this component mounts (it only
// renders once the user is authenticated), so stash the event at module load.
let pendingInstallPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pendingInstallPrompt = e;
  });
}

// iPads on iPadOS 13+ report as MacIntel; the touch-point check tells them apart
const isIosDevice = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Add to Home Screen only exists in Safari proper — other iOS browsers and
// in-app webviews (Outlook, Teams) don't offer it, so don't tease them
const isIosSafari = () =>
  isIosDevice() &&
  /safari/i.test(navigator.userAgent) &&
  !/crios|fxios|edgios|opios|gsa|duckduckgo/i.test(navigator.userAgent);

const isRunningStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function InstallAppNudge() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [installPrompt, setInstallPrompt] = useState(() => pendingInstallPrompt);
  const [installed, setInstalled] = useState(() => isRunningStandalone());

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      pendingInstallPrompt = e;
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      pendingInstallPrompt = null;
      setInstallPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore — banner still hides for this page load
    }
  };

  const handleInstall = () => {
    const prompt = installPrompt;
    // The stashed event is single-use; clear it so the banner hides either way
    pendingInstallPrompt = null;
    setInstallPrompt(null);
    prompt.prompt();
  };

  if (dismissed || installed) {
    return null;
  }

  const canPromptInstall = !!installPrompt;
  const showIosInstructions = !canPromptInstall && isIosSafari();

  if (!canPromptInstall && !showIosInstructions) {
    return null;
  }

  return (
    <Alert
      icon={false}
      sx={{
        mb: 2,
        backgroundColor: 'rgba(107, 142, 107, 0.08)',
        border: '1px solid rgba(107, 142, 107, 0.25)',
        color: 'text.primary',
        alignItems: 'center',
        '& .MuiAlert-message': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 },
      }}
      action={
        <IconButton
          aria-label="Dismiss install suggestion"
          color="inherit"
          size="small"
          onClick={handleDismiss}
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      }
    >
      {canPromptInstall ? (
        <>
          <span>
            <strong>Put Tally on your home screen</strong> — full-screen, one tap away.
          </span>
          <Button
            variant="contained"
            size="small"
            color="primary"
            onClick={handleInstall}
            sx={{ ml: 'auto' }}
          >
            Install
          </Button>
        </>
      ) : (
        <span>
          <strong>Put Tally on your home screen</strong> — tap the{' '}
          <IosShareIcon fontSize="small" sx={{ verticalAlign: 'text-bottom' }} aria-label="Share" />{' '}
          Share button in Safari, then choose &lsquo;Add to Home Screen&rsquo;.
        </span>
      )}
    </Alert>
  );
}
