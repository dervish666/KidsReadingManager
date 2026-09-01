import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import CloseIcon from '@mui/icons-material/Close';
import { QRCodeSVG } from 'qrcode.react';
import TallyLogo from '../TallyLogo';
import { useAuth } from '../../contexts/AuthContext';

/**
 * QRCodeSheet - Print sheet of parent QR codes.
 *
 * Renders one section per class, each a 3-column grid of cards containing a QR
 * code linking to the parent portal, the child's first name, their class, and
 * Tally branding. Every card carries its class name because the cards get cut
 * apart and end up in a pile.
 *
 * Props:
 *   scope      {string}   'class' (default) or 'school' for every class at once
 *   classId    {string}   Class ID to generate tokens for (scope='class')
 *   className  {string}   Display name of the class (scope='class')
 *   onClose    {Function} Called when the sheet should close
 */
const QRCodeSheet = ({ classId, className, scope = 'class', onClose }) => {
  const { fetchWithAuth } = useAuth();
  // [{ id, name, students: [...] }] — one entry per class, always at least one.
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSchool = useCallback(async () => {
    // Generate first so pupils added since the last print get a code too.
    await fetchWithAuth('/api/parent/school/generate', { method: 'POST' });
    const res = await fetchWithAuth('/api/parent/school/tokens');
    if (!res.ok) {
      throw new Error('Failed to load parent tokens');
    }
    const data = await res.json();
    return (data.classes || []).map((group) => ({
      id: group.classId || 'unassigned',
      name: group.className,
      students: group.tokens || [],
    }));
  }, [fetchWithAuth]);

  const loadClass = useCallback(async () => {
    await fetchWithAuth(`/api/parent/generate/${classId}`, { method: 'POST' });
    const res = await fetchWithAuth(`/api/parent/class/${classId}`);
    if (!res.ok) {
      throw new Error('Failed to load parent tokens');
    }
    const data = await res.json();
    return [{ id: classId, name: className, students: data.tokens || [] }];
  }, [classId, className, fetchWithAuth]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = scope === 'school' ? await loadSchool() : await loadClass();
        if (!cancelled) setSections(loaded);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to generate QR codes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (scope === 'school' || classId) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [scope, classId, loadSchool, loadClass]);

  const getParentUrl = (token) => `${window.location.origin}/parent/${token}`;

  // Continuous dashed cut lines: the grid container draws the top + left edges,
  // each cell draws its right + bottom edge. With no gap, neighbouring edges line
  // up into straight dashed lines you can guillotine in one stroke.
  const CUT_LINE = '1px dashed rgba(45, 80, 22, 0.5)';
  const COLUMNS = 3;

  const totalCodes = sections.reduce((sum, section) => sum + section.students.length, 0);
  const heading =
    scope === 'school'
      ? `Parent QR codes: whole school`
      : `Parent QR codes: ${sections[0]?.name || className}`;

  // Rows of three. The grid is a table rather than a CSS grid for one reason:
  // a <thead> repeats on every printed page, so a class of 30 that spills onto
  // a second sheet still says which class it is at the top. The cards
  // themselves carry only the code, the child's first name and the logo.
  const toRows = (students) => {
    const rows = [];
    for (let i = 0; i < students.length; i += COLUMNS) {
      rows.push(students.slice(i, i + COLUMNS));
    }
    return rows;
  };

  const CELL_PRINT = {
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  };

  const renderSection = (section, index) => {
    const rows = toRows(section.students);
    // Pad the final row so the cut lines run straight across to the right edge.
    const fillerCount = rows.length ? COLUMNS - rows[rows.length - 1].length : 0;

    return (
      <Box
        key={section.id}
        component="table"
        sx={{
          width: '100%',
          tableLayout: 'fixed',
          // Collapsed borders merge each cell's dashed edge with its
          // neighbour's into one straight line you can guillotine in a stroke.
          borderCollapse: 'collapse',
          mb: 4,
          // Each class starts on its own sheet, so a printed pile can be split
          // by class without reading a single name.
          ...(index > 0 && {
            '@media print': { breakBefore: 'page', pageBreakBefore: 'always' },
          }),
        }}
      >
        <Box component="thead" sx={{ '@media print': { display: 'table-header-group' } }}>
          <tr>
            <Box
              component="th"
              colSpan={COLUMNS}
              sx={{ textAlign: 'left', border: 'none', p: 0, pb: 1 }}
            >
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, color: '#2d5016', fontFamily: '"Nunito", sans-serif' }}
              >
                {section.name}
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ color: 'text.secondary', fontWeight: 500, ml: 1 }}
                >
                  {section.students.length} {section.students.length === 1 ? 'code' : 'codes'}
                </Typography>
              </Typography>
            </Box>
          </tr>
        </Box>

        <tbody>
          {rows.map((row, rowIndex) => (
            <Box
              component="tr"
              key={row[0].tokenId}
              sx={{ '@media print': { breakInside: 'avoid', pageBreakInside: 'avoid' } }}
            >
              {row.map((student) => (
                <Box
                  component="td"
                  key={student.tokenId}
                  sx={{ border: CUT_LINE, p: 2, '@media print': CELL_PRINT }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.5,
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
                        mt: 0.5,
                      }}
                    >
                      {student.studentFirstName}
                    </Typography>

                    {/* Tally branding */}
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
                </Box>
              ))}

              {/* Empty cells keep the cut lines straight across the final row */}
              {rowIndex === rows.length - 1 &&
                Array.from({ length: fillerCount }).map((_, i) => (
                  <Box
                    component="td"
                    key={`filler-${i}`}
                    aria-hidden
                    sx={{ border: CUT_LINE, '@media print': CELL_PRINT }}
                  />
                ))}
            </Box>
          ))}
        </tbody>
      </Box>
    );
  };

  return (
    <Box className="qr-print-root">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: portrait; margin: 10mm; }

          /* The sheet lives inside a MUI Dialog, and a dialog is a fixed-height
             scroll box: without this, printing a whole school gives you page one
             and fourteen blank sheets. Let every ancestor flow instead. */
          .MuiDialog-root,
          .MuiDialog-container,
          .MuiDialog-paper,
          .MuiDialogContent-root {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            background: white !important;
          }
          .MuiBackdrop-root { display: none !important; }

          /* Print the sheet and nothing else — the app is still behind the
             dialog and would otherwise print with it. Guarded by :has() so
             this can only fire while the sheet really is inside a dialog; a
             browser without :has() drops the rule and prints as it did before. */
          body:has(.MuiDialog-root .qr-print-root) > *:not(.MuiDialog-root) {
            display: none !important;
          }
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
          {heading}
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

      {!loading && !error && totalCodes === 0 && (
        <Alert severity="info">
          {scope === 'school'
            ? 'No pupils with parent tokens found for this school.'
            : 'No students with parent tokens found for this class.'}
        </Alert>
      )}

      {!loading && !error && totalCodes > 0 && (
        <>
          <Typography
            className="no-print"
            variant="caption"
            sx={{ display: 'block', color: 'text.secondary', mb: 1 }}
          >
            ✂ {totalCodes} codes
            {scope === 'school'
              ? ` across ${sections.length} classes, one class per page.`
              : '.'}{' '}
            Print, then cut along the dashed lines.
          </Typography>
          {sections.map(renderSection)}
        </>
      )}
    </Box>
  );
};

export default QRCodeSheet;
