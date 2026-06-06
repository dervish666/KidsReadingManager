import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from '@mui/material/styles';
import TallyLogo from '../TallyLogo';
import { useAuth } from '../../contexts/AuthContext';

/**
 * ParentQRButton - Single-student parent QR code button + dialog.
 *
 * Props:
 *   studentId    {string}              Student ID
 *   studentName  {string}              Student full name
 *   variant      {'icon' | 'button'}  Display variant
 */
const ParentQRButton = ({ studentId, studentName, variant = 'icon' }) => {
  const theme = useTheme();
  const { fetchWithAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const firstName = studentName ? studentName.split(' ')[0] : '';
  const parentUrl = token ? `${window.location.origin}/parent/${token}` : '';

  const fetchExistingToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/parent/token/student/${studentId}`);
      if (!res.ok) {
        throw new Error('Failed to load parent link');
      }
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
      } else {
        const genRes = await fetchWithAuth(`/api/parent/generate/student/${studentId}`, {
          method: 'POST',
        });
        if (!genRes.ok) {
          throw new Error('Failed to generate parent link');
        }
        const genData = await genRes.json();
        setToken(genData.token);
      }
    } catch (err) {
      setError(err.message || 'Failed to load parent link');
    } finally {
      setLoading(false);
    }
  }, [studentId, fetchWithAuth]);

  const regenerateToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/parent/generate/student/${studentId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to regenerate parent link');
      }
      const data = await res.json();
      setToken(data.token);
    } catch (err) {
      setError(err.message || 'Failed to regenerate parent link');
    } finally {
      setLoading(false);
    }
  }, [studentId, fetchWithAuth]);

  const handleOpen = () => {
    setOpen(true);
    if (!token) {
      fetchExistingToken();
    }
  };

  const handleClose = () => {
    setOpen(false);
    setCopied(false);
  };

  const handleRegenerate = () => {
    setToken(null);
    regenerateToken();
  };

  const handleCopyLink = async () => {
    if (!parentUrl) return;
    try {
      await navigator.clipboard.writeText(parentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: not critical
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {variant === 'icon' ? (
        <Tooltip title="Parent QR Code">
          <IconButton
            size="small"
            aria-label="parent qr code"
            onClick={handleOpen}
            sx={{ color: 'parent.accent' }}
          >
            <QrCode2Icon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          variant="outlined"
          size="small"
          startIcon={<QrCode2Icon />}
          onClick={handleOpen}
          sx={{
            borderColor: 'parent.accent',
            color: 'parent.accent',
            '&:hover': { borderColor: 'parent.accentHover', bgcolor: 'parent.accentFaint' },
          }}
        >
          Parent Link
        </Button>
      )}

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'parent.surface',
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 700,
            color: 'parent.accent',
            fontFamily: '"Nunito", sans-serif',
            pb: 1,
          }}
        >
          Parent QR Code
        </DialogTitle>
        <DialogContent>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: 'parent.accent' }} />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {!loading && !error && token && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
                py: 1,
              }}
            >
              {/*
                Print isolation: when the user prints, hide everything except the
                QR card and centre it on the page so only a clean, cut-out card
                comes out (not the whole modal). This <style> is only mounted while
                the dialog is open, so it never affects other printing in the app.
              */}
              <style>{`
                @media print {
                  body * { visibility: hidden !important; }
                  #qr-print-card, #qr-print-card * { visibility: visible !important; }
                  #qr-print-card {
                    position: fixed !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) scale(1.5) !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                  }
                  @page { size: portrait; margin: 12mm; }
                }
              `}</style>
              <Box
                id="qr-print-card"
                sx={{
                  border: '1.5px dashed',
                  borderColor: 'parent.accentBorder',
                  borderRadius: 2,
                  bgcolor: 'parent.surface',
                  p: 2.5,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1.5,
                }}
              >
                <QRCodeSVG value={parentUrl} size={140} level="M" style={{ display: 'block' }} />

                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    color: 'parent.accent',
                    fontFamily: '"Nunito", sans-serif',
                  }}
                >
                  {firstName}
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: 0.6 }}>
                  <TallyLogo size={14} color={theme.palette.parent.accent} />
                  <Typography
                    variant="caption"
                    sx={{ color: 'parent.accent', fontWeight: 600, fontSize: '0.65rem' }}
                  >
                    Tally Reading
                  </Typography>
                </Box>
              </Box>

              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 220 }}
              >
                Parents can scan this code to log reading sessions for {firstName}.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2, gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            size="small"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            disabled={!token || loading}
            sx={{ color: 'parent.accent', borderColor: 'parent.accent' }}
            variant="outlined"
          >
            Print
          </Button>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopyLink}
            disabled={!token || loading}
            variant="outlined"
            sx={{ color: 'parent.accent', borderColor: 'parent.accent' }}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleRegenerate}
            disabled={loading}
            variant="outlined"
            sx={{ color: 'text.secondary', borderColor: 'divider' }}
          >
            Regenerate
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ParentQRButton;
