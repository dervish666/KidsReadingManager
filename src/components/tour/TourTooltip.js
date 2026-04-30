import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

const TourTooltip = ({
  _continuous,
  index,
  step,
  size,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}) => {
  const isFirst = index === 0;
  const isLast = index === size - 1;

  return (
    <Box
      {...tooltipProps}
      sx={{
        width: 320,
        maxWidth: 'calc(100vw - 32px)',
        borderRadius: '16px',
        background: 'rgba(255, 254, 249, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(139, 115, 85, 0.15)',
        boxShadow: '0 12px 40px rgba(139, 115, 85, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          pt: 2,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography
          sx={{
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            fontSize: '1rem',
            color: 'primary.main',
          }}
        >
          {step.title}
        </Typography>
        <IconButton
          {...closeProps}
          aria-label="Close tour"
          sx={{
            color: 'text.secondary',
            ml: 1,
            minWidth: 48,
            minHeight: 48,
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ px: 2.5, pb: 2 }}>
        <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'text.secondary' }}>
          {step.content}
        </Typography>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 2.5,
          pb: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* Progress dots */}
        <Box sx={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {Array.from({ length: size }, (_, i) => (
            <Box
              key={i}
              sx={{
                height: 8,
                borderRadius: i === index ? '4px' : '50%',
                width: i === index ? 20 : 8,
                background: i === index ? 'primary.main' : 'rgba(107, 142, 107, 0.25)',
                transition: 'all 0.2s ease',
              }}
            />
          ))}
        </Box>

        {/* Buttons */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!isFirst && (
            <Button
              {...backProps}
              size="small"
              sx={{
                minHeight: 48,
                borderRadius: '10px',
                background: 'rgba(107, 142, 107, 0.1)',
                color: 'primary.main',
                fontWeight: 700,
                textTransform: 'none',
                fontSize: '0.85rem',
                boxShadow: 'none',
                '&:hover': {
                  background: 'rgba(107, 142, 107, 0.18)',
                  boxShadow: 'none',
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                },
              }}
            >
              Back
            </Button>
          )}
          {isFirst && !isLast && (
            <Button
              {...skipProps}
              size="small"
              sx={{
                minHeight: 48,
                color: 'text.secondary',
                fontWeight: 700,
                textTransform: 'none',
                fontSize: '0.85rem',
                boxShadow: 'none',
                '&:hover': {
                  background: 'transparent',
                  boxShadow: 'none',
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                },
              }}
            >
              Skip
            </Button>
          )}
          <Button
            {...primaryProps}
            size="small"
            sx={{
              minHeight: 48,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
              color: 'primary.contrastText',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '0.85rem',
              boxShadow: '0 4px 12px rgba(107, 142, 107, 0.25)',
              '&:hover': {
                boxShadow: '0 6px 20px rgba(107, 142, 107, 0.3)',
              },
              '&:focus-visible': {
                outline: '2px solid white',
                outlineOffset: 2,
              },
            }}
          >
            {isLast ? 'Done' : 'Next'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default TourTooltip;
