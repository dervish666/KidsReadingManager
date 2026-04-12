import React from 'react';
import { Box, Typography } from '@mui/material';

// Growth stages for the central plant (swapped as badges accumulate)
import gardenGrow1 from '../../assets/garden-seedling.png';
import gardenGrow2 from '../../assets/garden-grow-2.png';
import gardenGrow3 from '../../assets/garden-grow-3.png';
import gardenGrow4 from '../../assets/garden-grow-4.png';

// Static garden elements
import gardenFlower from '../../assets/garden-flower.png';
import gardenBush from '../../assets/garden-bush.png';
import gardenFlowers from '../../assets/garden-flowers.png';
import gardenSmallTree from '../../assets/garden-small-tree.png';
import gardenButterfly from '../../assets/garden-butterfly.png';
import gardenLargeTree from '../../assets/garden-large-tree.png';
import gardenBird from '../../assets/garden-bird.png';

const STAGES = [
  { name: 'Seedling', min: 0, max: 2 },
  { name: 'Sprout', min: 3, max: 7 },
  { name: 'Bloom', min: 8, max: 15 },
  { name: 'Full Garden', min: 16, max: Infinity },
];

function getStage(badgeCount) {
  return STAGES.find((s) => badgeCount >= s.min && badgeCount <= s.max) || STAGES[0];
}

// Growth stages: the central plant evolves through 4 images
const GROWTH_STAGES = [
  { src: gardenGrow1, minBadges: 1, height: '40%' },
  { src: gardenGrow2, minBadges: 5, height: '50%' },
  { src: gardenGrow3, minBadges: 9, height: '58%' },
  { src: gardenGrow4, minBadges: 13, height: '65%' },
];

function getCurrentGrowth(badgeCount) {
  let current = null;
  for (const stage of GROWTH_STAGES) {
    if (badgeCount >= stage.minBadges) current = stage;
  }
  return current;
}

// Static elements that appear at threshold
const GARDEN_ELEMENTS = [
  { src: gardenFlower, alt: 'Wildflower', minBadges: 3, left: '58%', bottom: '10%', height: '48%' },
  { src: gardenBush, alt: 'Bush', minBadges: 5, left: '70%', bottom: '14%', height: '38%' },
  { src: gardenFlowers, alt: 'Flower patch', minBadges: 7, left: '28%', bottom: '8%', height: '52%' },
  { src: gardenSmallTree, alt: 'Apple tree', minBadges: 9, left: '78%', bottom: '10%', height: '60%' },
  { src: gardenButterfly, alt: 'Butterfly', minBadges: 11, left: '50%', bottom: '55%', height: '32%' },
  { src: gardenLargeTree, alt: 'Oak tree', minBadges: 13, left: '2%', bottom: '8%', height: '80%' },
  { src: gardenBird, alt: 'Robin', minBadges: 16, left: '18%', bottom: '50%', height: '28%' },
];

function getGroundGradient(badgeCount) {
  if (badgeCount < 3) {
    return 'linear-gradient(180deg, transparent 70%, #D4A574 85%, #C49A6C 100%)';
  }
  if (badgeCount < 7) {
    return 'linear-gradient(180deg, transparent 70%, #B8C49A 82%, #C49A6C 100%)';
  }
  if (badgeCount < 13) {
    return 'linear-gradient(180deg, transparent 70%, #A8D48C 82%, #B8C49A 94%, #C49A6C 100%)';
  }
  return 'linear-gradient(180deg, transparent 65%, #A8D48C 78%, #8FBF6F 90%, #B8C49A 100%)';
}

function getSkyGradient(badgeCount) {
  if (badgeCount < 1) {
    return 'linear-gradient(180deg, #F5EFD6 0%, #FFF8EE 100%)';
  }
  if (badgeCount < 7) {
    return 'linear-gradient(180deg, #EDF5E4 0%, #F5EFD6 60%, #FFF8EE 100%)';
  }
  return 'linear-gradient(180deg, #E8F5E2 0%, #EDF5E4 40%, #F5EFD6 80%, #FFF8EE 100%)';
}

// When used for class goals (stage prop), map stage names to effective badge counts
// so the garden fills in appropriately for 0–3 completed goals
const STAGE_BADGE_MAP = {
  seedling: 0,
  sprout: 5,
  bloom: 11,
  full_garden: 16,
};

export default function GardenHeader({ badgeCount = 0, studentName = '', stage: stageProp, label }) {
  const stage = stageProp
    ? STAGES.find((s) => s.name.toLowerCase().replace(/ /g, '_') === stageProp) || STAGES[0]
    : getStage(badgeCount);

  // When stage prop is used (class goals), derive badge count from the stage
  const effectiveBadgeCount = stageProp ? (STAGE_BADGE_MAP[stageProp] ?? 0) : badgeCount;

  const subtitle = label || (studentName ? `${studentName}'s Reading Garden` : 'Reading Garden');
  const growth = getCurrentGrowth(effectiveBadgeCount);

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px 12px 0 0',
        height: 130,
        background: getSkyGradient(effectiveBadgeCount),
      }}
    >
      {/* Ground layer */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: getGroundGradient(effectiveBadgeCount),
          transition: 'background 0.8s ease',
        }}
      />

      {/* Growing central plant — swaps through 4 growth stages */}
      {GROWTH_STAGES.map((gs) => {
        const isActive = growth && growth.src === gs.src;
        return (
          <Box
            key={gs.minBadges}
            component="img"
            src={gs.src}
            alt={`Plant growth stage ${gs.minBadges}`}
            sx={{
              position: 'absolute',
              left: '43%',
              bottom: '10%',
              height: gs.height,
              width: 'auto',
              objectFit: 'contain',
              transformOrigin: 'bottom center',
              opacity: isActive ? 1 : 0,
              transform: isActive ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(5px)',
              transition: 'opacity 0.8s ease, transform 0.8s ease',
              pointerEvents: 'none',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))',
            }}
          />
        );
      })}

      {/* Static garden elements */}
      {GARDEN_ELEMENTS.map((el) => (
        <Box
          key={el.alt}
          component="img"
          src={el.src}
          alt={el.alt}
          sx={{
            position: 'absolute',
            left: el.left,
            bottom: el.bottom,
            height: el.height,
            width: 'auto',
            objectFit: 'contain',
            opacity: effectiveBadgeCount >= el.minBadges ? 1 : 0,
            transform: effectiveBadgeCount >= el.minBadges ? 'scale(1) translateY(0)' : 'scale(0.6) translateY(10px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))',
          }}
        />
      ))}

      {/* Text overlay */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          textAlign: 'center',
          pb: 0.5,
          background: 'linear-gradient(transparent, rgba(255,254,249,0.7))',
          pt: 2,
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#5D6B4A', fontWeight: 600, fontSize: '0.75rem' }}>
          {subtitle}
        </Typography>
        <Typography variant="caption" sx={{ color: '#7A8B66', fontSize: '0.65rem' }}>
          {stageProp ? stage.name + ' stage' : `${badgeCount} badge${badgeCount !== 1 ? 's' : ''} earned · ${stage.name} stage`}
        </Typography>
      </Box>
    </Box>
  );
}
