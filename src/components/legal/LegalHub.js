import React, { useEffect } from 'react';
import { Box, Typography, Divider } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TallyLogo from '../TallyLogo';
import LegalPageShell from './LegalPageShell';
import { LEGAL_GROUPS } from './legalDocs';

const docHref = (doc) => (doc.type === 'page' ? doc.href : `/legal/${doc.slug}`);

const DocCard = ({ doc }) => (
  <Box
    component="a"
    href={docHref(doc)}
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      p: 2,
      textDecoration: 'none',
      borderRadius: '12px',
      border: '1px solid rgba(139, 115, 85, 0.15)',
      backgroundColor: 'rgba(255, 254, 249, 0.6)',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease',
      '&:hover': {
        backgroundColor: 'rgba(138, 173, 138, 0.08)',
        boxShadow: '0 4px 16px rgba(139, 115, 85, 0.1)',
        transform: 'translateY(-2px)',
      },
      '&:hover .legal-card-arrow': { transform: 'translateX(3px)', opacity: 1 },
    }}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        sx={{
          fontWeight: 700,
          color: 'text.primary',
          fontFamily: '"DM Sans", sans-serif',
          fontSize: '1.02rem',
          mb: 0.25,
        }}
      >
        {doc.title}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.5 }}>
        {doc.summary}
      </Typography>
    </Box>
    <ArrowForwardIcon
      className="legal-card-arrow"
      sx={{
        color: '#6B8E6B',
        opacity: 0.6,
        transition: 'transform 0.15s ease, opacity 0.15s ease',
        flexShrink: 0,
      }}
    />
  </Box>
);

// Index page at /legal: a single place gathering every Tally legal & compliance
// document, easy to reference (e.g. from a school's DPIA or due-diligence form).
const LegalHub = () => {
  useEffect(() => {
    document.title = 'Legal & Compliance · Tally Reading';
  }, []);

  return (
    <LegalPageShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <TallyLogo size={22} color="white" />
        </Box>
        <Typography
          variant="h3"
          component="h1"
          sx={{ fontSize: { xs: '1.6rem', sm: '2rem' }, color: 'text.primary' }}
        >
          Legal &amp; Compliance
        </Typography>
      </Box>

      <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.7 }}>
        Everything in one place. These are the policies and data-protection documents for Tally
        Reading (operated by Scratch IT LTD). Schools and their data protection officers are welcome
        to reference and link to any of them — for example, when completing a DPIA or supplier
        due-diligence assessment.
      </Typography>

      <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mb: 1 }} />

      {LEGAL_GROUPS.map((group) => (
        <Box key={group.key} sx={{ mt: 3 }}>
          <Typography
            variant="h6"
            component="h2"
            sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5, fontSize: '1.15rem' }}
          >
            {group.title}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
            {group.blurb}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {group.docs.map((doc) => (
              <DocCard key={doc.slug} doc={doc} />
            ))}
          </Box>
        </Box>
      ))}

      <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.15)', mt: 4, mb: 2 }} />

      <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.6 }}>
        Data protection enquiries:{' '}
        <Box
          component="a"
          href="mailto:privacy@tallyreading.uk"
          sx={{ color: '#6B8E6B', textDecoration: 'underline' }}
        >
          privacy@tallyreading.uk
        </Box>
      </Typography>
    </LegalPageShell>
  );
};

export default LegalHub;
