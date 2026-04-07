import React from 'react';
import { Box, Typography } from '@mui/material';

const STAGES = [
  { name: 'Seedling', min: 0, max: 2 },
  { name: 'Sprout', min: 3, max: 7 },
  { name: 'Bloom', min: 8, max: 15 },
  { name: 'Full Garden', min: 16, max: Infinity },
];

function getStage(badgeCount) {
  return STAGES.find((s) => badgeCount >= s.min && badgeCount <= s.max) || STAGES[0];
}

function SeedlingSvg() {
  return (
    <svg viewBox="0 0 300 80" width="100%" height="80">
      {/* Ground */}
      <rect x="0" y="60" width="300" height="20" fill="#D4A574" rx="4" />
      <rect x="0" y="55" width="300" height="10" fill="#C49A6C" rx="4" />
      {/* Single seedling */}
      <line x1="150" y1="55" x2="150" y2="35" stroke="#7A9B5A" strokeWidth="2" />
      <ellipse cx="145" cy="32" rx="6" ry="8" fill="#8FB573" transform="rotate(-20,145,32)" />
      <ellipse cx="155" cy="32" rx="6" ry="8" fill="#8FB573" transform="rotate(20,155,32)" />
    </svg>
  );
}

function SproutSvg() {
  return (
    <svg viewBox="0 0 300 80" width="100%" height="80">
      <rect x="0" y="60" width="300" height="20" fill="#D4A574" rx="4" />
      <rect x="0" y="55" width="300" height="10" fill="#C49A6C" rx="4" />
      {/* Small plants */}
      <line x1="80" y1="55" x2="80" y2="30" stroke="#7A9B5A" strokeWidth="2" />
      <ellipse cx="74" cy="28" rx="8" ry="10" fill="#8FB573" transform="rotate(-15,74,28)" />
      <ellipse cx="86" cy="28" rx="8" ry="10" fill="#8FB573" transform="rotate(15,86,28)" />
      <line x1="150" y1="55" x2="150" y2="25" stroke="#6B8F50" strokeWidth="2.5" />
      <ellipse cx="143" cy="22" rx="9" ry="11" fill="#86A86B" transform="rotate(-20,143,22)" />
      <ellipse cx="157" cy="22" rx="9" ry="11" fill="#86A86B" transform="rotate(20,157,22)" />
      <line x1="220" y1="55" x2="220" y2="35" stroke="#7A9B5A" strokeWidth="2" />
      <ellipse cx="215" cy="33" rx="7" ry="9" fill="#8FB573" transform="rotate(-10,215,33)" />
      <ellipse cx="225" cy="33" rx="7" ry="9" fill="#8FB573" transform="rotate(10,225,33)" />
      {/* Butterfly */}
      <ellipse cx="120" cy="20" rx="5" ry="3" fill="#E8B4C8" transform="rotate(-30,120,20)" />
      <ellipse cx="128" cy="20" rx="5" ry="3" fill="#E8B4C8" transform="rotate(30,128,20)" />
      <circle cx="124" cy="22" r="1" fill="#3D3427" />
    </svg>
  );
}

function BloomSvg() {
  return (
    <svg viewBox="0 0 300 80" width="100%" height="80">
      <rect x="0" y="60" width="300" height="20" fill="#D4A574" rx="4" />
      <rect x="0" y="55" width="300" height="10" fill="#B8D4A0" rx="4" />
      {/* Small tree */}
      <rect x="68" y="30" width="4" height="25" fill="#8B6B4A" />
      <circle cx="70" cy="22" r="16" fill="#6B8F50" />
      <circle cx="62" cy="18" r="10" fill="#86A86B" />
      <circle cx="78" cy="18" r="10" fill="#86A86B" />
      {/* Flowers */}
      <line x1="140" y1="55" x2="140" y2="30" stroke="#7A9B5A" strokeWidth="2" />
      <circle cx="140" cy="26" r="5" fill="#E8B4C8" />
      <circle cx="140" cy="26" r="2" fill="#F5D76E" />
      <line x1="170" y1="55" x2="170" y2="35" stroke="#7A9B5A" strokeWidth="2" />
      <circle cx="170" cy="31" r="4" fill="#D4A0D4" />
      <circle cx="170" cy="31" r="1.5" fill="#F5D76E" />
      <line x1="200" y1="55" x2="200" y2="32" stroke="#7A9B5A" strokeWidth="2" />
      <circle cx="200" cy="28" r="5" fill="#F5D76E" />
      <circle cx="200" cy="28" r="2" fill="#CD7F32" />
      {/* Plants */}
      <line x1="240" y1="55" x2="240" y2="35" stroke="#6B8F50" strokeWidth="2" />
      <ellipse cx="235" cy="32" rx="7" ry="9" fill="#86A86B" transform="rotate(-15,235,32)" />
      <ellipse cx="245" cy="32" rx="7" ry="9" fill="#86A86B" transform="rotate(15,245,32)" />
      {/* Bird */}
      <path d="M250,15 Q255,10 260,15 Q255,12 250,15" fill="#8B6B4A" />
    </svg>
  );
}

function FullGardenSvg() {
  return (
    <svg viewBox="0 0 300 80" width="100%" height="80">
      <rect x="0" y="60" width="300" height="20" fill="#C49A6C" rx="4" />
      <rect x="0" y="55" width="300" height="10" fill="#A8D48C" rx="4" />
      {/* Large tree */}
      <rect x="38" y="25" width="5" height="30" fill="#8B6B4A" />
      <circle cx="40" cy="15" r="18" fill="#5A8040" />
      <circle cx="30" cy="10" r="12" fill="#6B8F50" />
      <circle cx="50" cy="10" r="12" fill="#6B8F50" />
      <circle cx="40" cy="5" r="10" fill="#86A86B" />
      {/* Flowers field */}
      {[95, 115, 135, 155, 175].map((x, i) => (
        <React.Fragment key={i}>
          <line x1={x} y1={55} x2={x} y2={30 + (i % 2) * 5} stroke="#7A9B5A" strokeWidth="2" />
          <circle cx={x} cy={26 + (i % 2) * 5} r={4 + (i % 3)} fill={['#E8B4C8', '#F5D76E', '#D4A0D4', '#E8B4C8', '#F5D76E'][i]} />
          <circle cx={x} cy={26 + (i % 2) * 5} r={1.5} fill="#CD7F32" />
        </React.Fragment>
      ))}
      {/* Second tree */}
      <rect x="218" y="30" width="4" height="25" fill="#8B6B4A" />
      <circle cx="220" cy="22" r="14" fill="#6B8F50" />
      <circle cx="212" cy="18" r="9" fill="#86A86B" />
      <circle cx="228" cy="18" r="9" fill="#86A86B" />
      {/* Small creatures */}
      <circle cx="260" cy="52" r="3" fill="#CD7F32" /> {/* Hedgehog body */}
      <circle cx="263" cy="51" r="1" fill="#3D3427" /> {/* Eye */}
      {/* Butterfly */}
      <ellipse cx="85" cy="15" rx="5" ry="3" fill="#E8B4C8" transform="rotate(-30,85,15)" />
      <ellipse cx="93" cy="15" rx="5" ry="3" fill="#D4A0D4" transform="rotate(30,93,15)" />
      {/* Bird */}
      <path d="M270,10 Q275,5 280,10 Q275,7 270,10" fill="#8B6B4A" />
    </svg>
  );
}

const SVG_COMPONENTS = {
  Seedling: SeedlingSvg,
  Sprout: SproutSvg,
  Bloom: BloomSvg,
  'Full Garden': FullGardenSvg,
};

export default function GardenHeader({ badgeCount = 0, studentName = '' }) {
  const stage = getStage(badgeCount);
  const SvgComponent = SVG_COMPONENTS[stage.name];

  return (
    <Box
      sx={{
        background: 'linear-gradient(180deg, #E8F5E2 0%, #F5EFD6 50%, #D4A574 100%)',
        p: 2,
        textAlign: 'center',
        borderRadius: '12px 12px 0 0',
      }}
    >
      <SvgComponent />
      <Typography variant="subtitle2" sx={{ color: '#5D6B4A', fontWeight: 600, mt: 0.5 }}>
        {studentName ? `${studentName}'s Reading Garden` : 'Reading Garden'}
      </Typography>
      <Typography variant="caption" sx={{ color: '#7A8B66' }}>
        {badgeCount} badge{badgeCount !== 1 ? 's' : ''} earned · {stage.name} stage
      </Typography>
    </Box>
  );
}
