import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Link } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import TallyLogo from '../TallyLogo';
import LegalPageShell from './LegalPageShell';
import { getMarkdownDoc } from './legalDocs';

// Styling for the rendered markdown, matching the cozy "bookshelf" theme used
// by the hand-built Privacy/Terms/Cookies pages.
const markdownSx = {
  fontFamily: '"DM Sans", sans-serif',
  color: 'text.primary',
  lineHeight: 1.75,
  fontSize: '0.95rem',
  '& h1': {
    fontSize: { xs: '1.6rem', sm: '2rem' },
    fontWeight: 700,
    mt: 0,
    mb: 1.5,
    color: 'text.primary',
  },
  '& h2': { fontSize: '1.3rem', fontWeight: 700, mt: 4, mb: 1.5, color: 'text.primary' },
  '& h3': { fontSize: '1.1rem', fontWeight: 700, mt: 3, mb: 1, color: '#6B8E6B' },
  '& h4': { fontSize: '1rem', fontWeight: 700, mt: 2, mb: 0.5, color: 'text.primary' },
  '& p': { mb: 2 },
  '& a': { color: '#6B8E6B', textDecoration: 'underline', wordBreak: 'break-word' },
  '& ul, & ol': { mb: 2, pl: 3 },
  '& li': { mb: 0.75 },
  '& strong': { fontWeight: 700 },
  '& em': { fontStyle: 'italic' },
  '& hr': { border: 'none', borderTop: '1px solid rgba(139, 115, 85, 0.15)', my: 3 },
  '& blockquote': {
    borderLeft: '3px solid rgba(107, 142, 107, 0.4)',
    pl: 2,
    ml: 0,
    my: 2,
    color: 'text.secondary',
    fontStyle: 'italic',
  },
  '& code': {
    fontFamily: 'monospace',
    fontSize: '0.85em',
    backgroundColor: 'rgba(139, 115, 85, 0.08)',
    px: 0.5,
    py: 0.25,
    borderRadius: '4px',
  },
  // Tables can be wide; allow horizontal scroll on small screens.
  '& .md-table-wrap': { overflowX: 'auto', my: 2 },
  '& table': { borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' },
  '& th, & td': {
    border: '1px solid rgba(139, 115, 85, 0.15)',
    p: 1,
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: 1.5,
  },
  '& thead th': {
    backgroundColor: 'rgba(107, 142, 107, 0.08)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  '& tbody tr:nth-of-type(even)': { backgroundColor: 'rgba(139, 115, 85, 0.03)' },
};

// Open external links in a new tab; leave in-page anchor (TOC) links alone.
const mdComponents = {
  a: ({ href = '', children }) => {
    const external = /^https?:\/\//i.test(href);
    return (
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    );
  },
  // Wrap tables so they can scroll horizontally without breaking the layout.
  table: ({ children }) => (
    <Box className="md-table-wrap">
      <table>{children}</table>
    </Box>
  ),
};

const Eyebrow = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 3 }}>
    <Box
      sx={{
        width: 32,
        height: 32,
        borderRadius: '8px',
        background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <TallyLogo size={18} color="white" />
    </Box>
    <Typography
      sx={{
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: '#8B7355',
        fontFamily: '"DM Sans", sans-serif',
      }}
    >
      Tally Reading — Legal &amp; Compliance
    </Typography>
  </Box>
);

// Renders a single legal document (from public/legal/<file>) at /legal/<slug>.
const LegalDocPage = ({ slug }) => {
  const doc = getMarkdownDoc(slug);
  const [state, setState] = useState({ status: doc ? 'loading' : 'unknown', text: '' });

  useEffect(() => {
    if (doc) {
      document.title = `${doc.title} · Tally Reading`;
    }
  }, [doc]);

  useEffect(() => {
    if (!doc) return undefined;
    let cancelled = false;
    setState({ status: 'loading', text: '' });
    fetch(`/legal/${doc.file}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setState({ status: 'ready', text });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', text: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  if (!doc) {
    return (
      <LegalPageShell backHref="/legal" backLabel="Back to Legal & Compliance">
        <Eyebrow />
        <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
          Document not found
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          We couldn&rsquo;t find that legal document. Please return to the{' '}
          <Link href="/legal" sx={{ color: '#6B8E6B' }}>
            Legal &amp; Compliance
          </Link>{' '}
          index.
        </Typography>
      </LegalPageShell>
    );
  }

  return (
    <LegalPageShell backHref="/legal" backLabel="Back to Legal & Compliance">
      <Eyebrow />

      {state.status === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#6B8E6B' }} />
        </Box>
      )}

      {state.status === 'error' && (
        <Typography sx={{ color: 'text.secondary' }}>
          Sorry, this document couldn&rsquo;t be loaded right now. You can email us at{' '}
          <Link href="mailto:privacy@tallyreading.uk" sx={{ color: '#6B8E6B' }}>
            privacy@tallyreading.uk
          </Link>{' '}
          for a copy.
        </Typography>
      )}

      {state.status === 'ready' && (
        <Box sx={markdownSx}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug]}
            components={mdComponents}
          >
            {state.text}
          </ReactMarkdown>
        </Box>
      )}
    </LegalPageShell>
  );
};

export default LegalDocPage;
