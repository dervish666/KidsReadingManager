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
            sx={{ color: '#2d5016' }}
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
            borderColor: '#2d5016',
            color: '#2d5016',
            '&:hover': { borderColor: '#4a7c28', bgcolor: 'rgba(45, 80, 22, 0.05)' },
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
            bgcolor: '#faf8f5',
          },
        }}
      >
        <DialogTitle
          sx={{ fontWeight: 700, color: '#2d5016', fontFamily: '"Nunito", sans-serif', pb: 1 }}
        >
          Parent QR Code
        </DialogTitle>
        <DialogContent>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: '#2d5016' }} />
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
              <Box
                sx={{
                  border: '1.5px dashed rgba(45, 80, 22, 0.35)',
                  borderRadius: 2,
                  bgcolor: '#faf8f5',
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
                  sx={{ fontWeight: 700, color: '#2d5016', fontFamily: '"Nunito", sans-serif' }}
                >
                  {firstName}
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: 0.6 }}>
                  <TallyLogo size={14} color="#2d5016" />
                  <Typography
                    variant="caption"
                    sx={{ color: '#2d5016', fontWeight: 600, fontSize: '0.65rem' }}
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
            sx={{ color: '#2d5016', borderColor: '#2d5016' }}
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
            sx={{ color: '#2d5016', borderColor: '#2d5016' }}
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
