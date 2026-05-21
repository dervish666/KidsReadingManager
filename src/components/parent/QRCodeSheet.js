import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import CloseIcon from '@mui/icons-material/Close';
import { QRCodeSVG } from 'qrcode.react';
import TallyLogo from '../TallyLogo';
import { useAuth } from '../../contexts/AuthContext';

/**
 * QRCodeSheet - Print sheet of parent QR codes for an entire class.
 * Renders a 3-column grid of cards, one per student, each containing
 * a QR code linking to the parent portal, student name, and Tally branding.
 *
 * Props:
 *   classId    {string}   Class ID to generate tokens for
 *   className  {string}   Display name of the class
 *   onClose    {Function} Called when the sheet should close
 */
const QRCodeSheet = ({ classId, className, onClose }) => {
  const { fetchWithAuth } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Generate tokens for all students in the class
        await fetchWithAuth(`/api/parent/generate/${classId}`, { method: 'POST' });
        // Fetch the class data with tokens
        const res = await fetchWithAuth(`/api/parent/class/${classId}`);
        if (!res.ok) {
          throw new Error('Failed to load parent tokens');
        }
        const data = await res.json();
        setStudents(data.tokens || []);
      } catch (err) {
        setError(err.message || 'Failed to generate QR codes');
      } finally {
        setLoading(false);
      }
    };

    if (classId) {
      load();
    }
  }, [classId, fetchWithAuth]);

  const getParentUrl = (token) => `${window.location.origin}/parent/${token}`;

  return (
    <Box>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 10mm; }
        }
      `}</style>

      {/* Print controls bar (hidden on print) */}
      <Box
        className="no-print"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          pb: 2,
          borderBottom: '1px solid rgba(139, 115, 85, 0.15)',
        }}
      >
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, color: '#2d5016', fontFamily: '"Nunito", sans-serif' }}
        >
          Parent QR Codes — {className}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
            disabled={loading || !!error}
            sx={{
              borderColor: '#2d5016',
              color: '#2d5016',
              '&:hover': { borderColor: '#4a7c28', bgcolor: 'rgba(45, 80, 22, 0.05)' },
            }}
          >
            Print
          </Button>
          <Button
            variant="text"
            startIcon={<CloseIcon />}
            onClick={onClose}
            sx={{ color: 'text.secondary' }}
          >
            Close
          </Button>
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#2d5016' }} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && students.length === 0 && (
        <Alert severity="info">No students with parent tokens found for this class.</Alert>
      )}

      {!loading && !error && students.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
            '@media print': {
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8mm',
            },
          }}
        >
          {students.map((student) => (
            <Box
              key={student.tokenId}
              sx={{
                border: '1.5px dashed rgba(45, 80, 22, 0.35)',
                borderRadius: 2,
                bgcolor: '#faf8f5',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                '@media print': {
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid',
                },
              }}
            >
              {/* QR code */}
              <QRCodeSVG
                value={getParentUrl(student.token)}
                size={100}
                level="M"
                style={{ display: 'block' }}
              />

              {/* Student first name */}
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  color: '#2d5016',
                  fontFamily: '"Nunito", sans-serif',
                  fontSize: '1rem',
                  textAlign: 'center',
                }}
              >
                {student.studentFirstName}
              </Typography>

              {/* Tally branding */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  opacity: 0.6,
                }}
              >
                <TallyLogo size={14} color="#2d5016" />
                <Typography
                  variant="caption"
                  sx={{ color: '#2d5016', fontWeight: 600, fontSize: '0.65rem' }}
                >
                  Tally Reading
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default QRCodeSheet;
