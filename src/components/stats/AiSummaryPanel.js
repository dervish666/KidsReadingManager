import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Divider,
  Tooltip,
  alpha,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../../contexts/AuthContext';

/**
 * AI narrative summary of the figures currently on the Stats page.
 *
 * The panel POSTs the same numbers the page is displaying, so the narrative
 * can never quote a total that contradicts the tiles above it. Only aggregate
 * counts and book titles leave the browser — no pupil names, ids or
 * demographics. See services/statsSummaryService.js for the allow-list.
 */

const SECTIONS = [
  {
    key: 'highlights',
    title: 'Going well',
    Icon: CheckCircleOutlineIcon,
    color: 'success.main',
  },
  {
    key: 'watchOuts',
    title: 'Worth a look',
    Icon: VisibilityOutlinedIcon,
    color: 'warning.main',
  },
  {
    key: 'suggestedActions',
    title: 'Suggested next steps',
    Icon: PlaylistAddCheckIcon,
    color: 'primary.main',
  },
];

/** Flatten a summary into something worth pasting into a report. */
function summaryToText(summary, scope) {
  const lines = [];
  if (scope) lines.push(`Reading summary: ${scope.classLabel}, ${scope.periodLabel}`, '');
  if (summary.headline) lines.push(summary.headline, '');
  for (const { key, title } of SECTIONS) {
    const items = summary[key] || [];
    if (!items.length) continue;
    lines.push(`${title}:`);
    for (const item of items) lines.push(`  • ${item}`);
    lines.push('');
  }
  if (summary.notes?.length) {
    lines.push('Notes:');
    for (const note of summary.notes) lines.push(`  • ${note}`);
  }
  return lines.join('\n').trim();
}

/**
 * Read an error message off a failed response without assuming the body is
 * JSON — a 502 from Cloudflare is HTML, and `await response.json()` on it
 * throws a parse error that surfaces to the user as "Unexpected token <".
 */
async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return data?.error || data?.message || null;
  } catch {
    return null;
  }
}

const AiSummaryPanel = ({ scopeKey, scopeLabel, statsLoading, buildPayload, onClose }) => {
  const { fetchWithAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  // Set when the class or period changes under an existing summary. The old
  // narrative describes figures that are no longer on screen, so it is cleared
  // and the user is asked — regenerating automatically would both spend a
  // provider call per filter click and race the stats refetch.
  const [stale, setStale] = useState(false);
  // Guards against a second call while one is in flight: React 19 StrictMode
  // runs mount effects twice in dev, and each would be a separately billed
  // provider round-trip.
  const inFlight = useRef(false);

  const generate = useCallback(
    async ({ regenerate = false } = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      setCopied(false);
      setStale(false);
      try {
        const response = await fetchWithAuth('/api/students/stats/ai-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stats: buildPayload(), regenerate }),
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          setError(
            message ||
              (response.status === 403
                ? 'AI summaries are not enabled for this school.'
                : `Could not generate a summary (error ${response.status}).`)
          );
          // Keep whatever the user was already reading — losing a good summary
          // because a retry failed is worse than showing it alongside the error.
          return;
        }

        setResult(await response.json());
      } catch {
        setError('Could not reach the server. Check your connection and try again.');
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [buildPayload, fetchWithAuth]
  );

  // First render generates straight away — the panel only appears because the
  // head clicked the button, so a second click inside it would be silly. Later
  // scope changes only mark the panel stale.
  const firstScope = useRef(scopeKey);
  useEffect(() => {
    if (scopeKey === firstScope.current) {
      generate();
      return;
    }
    setResult(null);
    setError(null);
    setStale(true);
    // generate is intentionally omitted: it changes identity whenever the stats
    // do, and re-running this on that would defeat the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const handleCopy = async () => {
    if (!result?.summary) return;
    try {
      await navigator.clipboard.writeText(summaryToText(result.summary, result.scope));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to the clipboard. Your browser blocked it.');
    }
  };

  const summary = result?.summary;

  return (
    <Paper
      data-tour="stats-ai-summary"
      elevation={0}
      sx={{
        mb: 3,
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.primary.main, 0.25),
        backgroundColor: (theme) => alpha(theme.palette.primary.light, 0.07),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <AutoAwesomeIcon sx={{ color: 'primary.main' }} />
        <Typography
          variant="h6"
          component="h2"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, flexGrow: 1 }}
        >
          AI Summary
        </Typography>

        {summary && !loading && (
          <>
            <Tooltip title={copied ? 'Copied' : 'Copy for a report'}>
              <IconButton onClick={handleCopy} size="small" aria-label="Copy summary">
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Write it again">
              <span>
                <IconButton
                  // regenerate: true skips the server cache, which is keyed on
                  // the figures — without it this button would hand back the
                  // identical text every time until the numbers changed.
                  onClick={() => generate({ regenerate: true })}
                  size="small"
                  disabled={statsLoading}
                  aria-label="Regenerate summary"
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
        <Tooltip title="Hide summary">
          <IconButton onClick={onClose} size="small" aria-label="Hide summary">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {result?.scope && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {result.scope.classLabel} · {result.scope.periodLabel}
          {result.cached ? ' · reused, the figures have not changed' : ''}
        </Typography>
      )}

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary">
            Reading through the figures. This takes a few seconds.
          </Typography>
        </Box>
      )}

      {!loading && stale && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
            The figures have changed{scopeLabel ? `, now showing ${scopeLabel}.` : '.'}
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => generate()}
            disabled={statsLoading}
            sx={{ borderRadius: 3, fontWeight: 600 }}
          >
            Summarise these
          </Button>
        </Box>
      )}

      {!loading && error && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={generate}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Not gated on `!error`: a failed retry keeps the summary the user was
          already reading, shown below the warning rather than replaced by it. */}
      {!loading && !stale && summary && (
        <Box sx={{ mt: error ? 2 : 0 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 2, lineHeight: 1.6 }}>
            {summary.headline}
          </Typography>

          {SECTIONS.map(({ key, title, Icon, color }) => {
            const items = summary[key] || [];
            if (!items.length) return null;
            return (
              <Box key={key} sx={{ mb: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Icon fontSize="small" sx={{ color }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {title}
                  </Typography>
                </Box>
                <Box component="ul" sx={{ m: 0, pl: 3.5 }}>
                  {items.map((item, i) => (
                    <Typography
                      component="li"
                      variant="body2"
                      key={i}
                      sx={{ mb: 0.75, lineHeight: 1.6 }}
                    >
                      {item}
                    </Typography>
                  ))}
                </Box>
              </Box>
            );
          })}

          {summary.notes?.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              {summary.notes.map((note, i) => (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  key={i}
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  {note}
                </Typography>
              ))}
            </>
          )}

          {result?.generated !== false && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 2, fontStyle: 'italic' }}
            >
              Written by AI from the figures on this page. Worth a skim before you quote it.
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default AiSummaryPanel;
