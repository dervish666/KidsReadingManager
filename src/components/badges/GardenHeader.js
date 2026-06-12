import React from 'react';
import { Box, Typography } from '@mui/material';

// Growth stages for the central plant (swapped as badges accumulate)
import gardenGrow1 from '../../assets/garden-seedling.webp';
import gardenGrow2 from '../../assets/garden-grow-2.webp';
import gardenGrow3 from '../../assets/garden-grow-3.webp';
import gardenGrow4 from '../../assets/garden-grow-4.webp';

// Static garden elements
import gardenFlower from '../../assets/garden-flower.webp';
import gardenBush from '../../assets/garden-bush.webp';
import gardenFlowers from '../../assets/garden-flowers.webp';
import gardenSmallTree from '../../assets/garden-small-tree.webp';
import gardenButterfly from '../../assets/garden-butterfly.webp';
import gardenLargeTree from '../../assets/garden-large-tree.webp';
import gardenBird from '../../assets/garden-bird.webp';
import gardenSignpost from '../../assets/garden-signpost-04.webp';
import {
  STAGES,
  getStage,
  stageFromApiName,
  goalsToEffectiveBadgeCount,
} from '../../utils/gardenStages';

// Re-exported for existing importers; the canonical tables live in utils/gardenStages
export { STAGES, getStage };

// Growth stages: the central plant evolves through 4 images
export const GROWTH_STAGES = [
  { src: gardenGrow1, minBadges: 1, height: '40%' },
  { src: gardenGrow2, minBadges: 5, height: '50%' },
  { src: gardenGrow3, minBadges: 9, height: '58%' },
  { src: gardenGrow4, minBadges: 13, height: '65%' },
];

export function getCurrentGrowth(badgeCount) {
  let current = null;
  for (const stage of GROWTH_STAGES) {
    if (badgeCount >= stage.minBadges) current = stage;
  }
  return current;
}

// Static elements that appear progressively as badges are earned
const GARDEN_ELEMENTS = [
  // First wildflowers (badges 2–3)
  { src: gardenFlower, alt: 'Wildflower', minBadges: 2, left: '18%', bottom: '8%', height: '35%' },
  { src: gardenFlower, alt: 'Wildflower', minBadges: 2, left: '62%', bottom: '10%', height: '30%' },
  {
    src: gardenFlowers,
    alt: 'Flower patch',
    minBadges: 3,
    left: '28%',
    bottom: '6%',
    height: '42%',
  },
  { src: gardenFlower, alt: 'Wildflower', minBadges: 4, left: '8%', bottom: '10%', height: '28%' },

  // Garden filling in (badges 5–7)
  { src: gardenBush, alt: 'Bush', minBadges: 5, left: '70%', bottom: '12%', height: '35%' },
  {
    src: gardenFlowers,
    alt: 'Flower patch',
    minBadges: 5,
    left: '52%',
    bottom: '8%',
    height: '38%',
  },
  { src: gardenFlower, alt: 'Wildflower', minBadges: 6, left: '38%', bottom: '12%', height: '26%' },
  {
    src: gardenFlowers,
    alt: 'Flower patch',
    minBadges: 7,
    left: '5%',
    bottom: '6%',
    height: '40%',
  },
  { src: gardenBush, alt: 'Bush', minBadges: 7, left: '22%', bottom: '12%', height: '30%' },

  // Trees and more life (badges 9–12)
  {
    src: gardenSmallTree,
    alt: 'Apple tree',
    minBadges: 9,
    left: '75%',
    bottom: '8%',
    height: '55%',
  },
  { src: gardenFlower, alt: 'Wildflower', minBadges: 9, left: '48%', bottom: '6%', height: '28%' },
  {
    src: gardenFlowers,
    alt: 'Flower patch',
    minBadges: 10,
    left: '60%',
    bottom: '5%',
    height: '34%',
  },
  {
    src: gardenButterfly,
    alt: 'Butterfly',
    minBadges: 11,
    left: '55%',
    bottom: '55%',
    height: '28%',
  },
  { src: gardenBush, alt: 'Bush', minBadges: 11, left: '42%', bottom: '10%', height: '32%' },
  {
    src: gardenFlower,
    alt: 'Wildflower',
    minBadges: 12,
    left: '15%',
    bottom: '14%',
    height: '24%',
  },

  // Full garden (badges 13+)
  { src: gardenLargeTree, alt: 'Oak tree', minBadges: 13, left: '2%', bottom: '8%', height: '75%' },
  {
    src: gardenFlowers,
    alt: 'Flower patch',
    minBadges: 13,
    left: '35%',
    bottom: '5%',
    height: '36%',
  },
  {
    src: gardenSmallTree,
    alt: 'Small tree',
    minBadges: 14,
    left: '32%',
    bottom: '10%',
    height: '45%',
  },
  { src: gardenFlower, alt: 'Wildflower', minBadges: 15, left: '82%', bottom: '8%', height: '26%' },
  { src: gardenBird, alt: 'Robin', minBadges: 16, left: '18%', bottom: '52%', height: '25%' },
  {
    src: gardenFlowers,
    alt: 'Flower patch',
    minBadges: 16,
    left: '68%',
    bottom: '6%',
    height: '32%',
  },
];

export function getGroundGradient(badgeCount) {
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

export function getSkyGradient(badgeCount) {
  if (badgeCount < 1) {
    return 'linear-gradient(180deg, #F5EFD6 0%, #FFF8EE 100%)';
  }
  if (badgeCount < 7) {
    return 'linear-gradient(180deg, #EDF5E4 0%, #F5EFD6 60%, #FFF8EE 100%)';
  }
  return 'linear-gradient(180deg, #E8F5E2 0%, #EDF5E4 40%, #F5EFD6 80%, #FFF8EE 100%)';
}

export default function GardenHeader({
  badgeCount = 0,
  studentName = '',
  stage: stageProp,
  label,
  goalsCompleted,
  height = 130,
  hideLabel = false,
}) {
  const stage = stageProp ? stageFromApiName(stageProp) || STAGES[0] : getStage(badgeCount);

  // When goalsCompleted is provided (class goals), map it to an effective badge count
  const effectiveBadgeCount =
    goalsCompleted != null ? goalsToEffectiveBadgeCount(goalsCompleted) : badgeCount;

  const subtitle = label || (studentName ? `${studentName}'s Reading Garden` : 'Reading Garden');
  const growth = getCurrentGrowth(effectiveBadgeCount);

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px 12px 0 0',
        height,
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
      {GARDEN_ELEMENTS.map((el, i) => (
        <Box
          key={i}
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
            transform:
              effectiveBadgeCount >= el.minBadges
                ? 'scale(1) translateY(0)'
                : 'scale(0.6) translateY(10px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))',
          }}
        />
      ))}

      {/* Signpost with stage label */}
      <Box
        sx={{
          position: 'absolute',
          right: '6%',
          bottom: '6%',
          height: '55%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <Box
          component="img"
          src={gardenSignpost}
          alt="Garden signpost"
          sx={{
            height: '100%',
            width: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.12))',
          }}
        />
        <Typography
          sx={{
            position: 'absolute',
            color: '#5D4E37',
            fontFamily: '"Nunito", "DM Sans", sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(0.65rem, 1.8vw, 0.85rem)',
            textAlign: 'center',
            letterSpacing: '0.02em',
            textShadow: '0 1px 0 rgba(255,255,255,0.3)',
            mt: '-8%',
            px: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {stage.name}
        </Typography>
      </Box>

      {/* Text overlay */}
      {!hideLabel && (
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
          <Typography
            variant="subtitle2"
            sx={{ color: '#5D6B4A', fontWeight: 700, fontSize: '0.85rem' }}
          >
            {subtitle}
          </Typography>
          <Typography variant="caption" sx={{ color: '#5D6B4A', fontSize: '0.75rem' }}>
            {stageProp
              ? stage.name + ' stage'
              : `${badgeCount} badge${badgeCount !== 1 ? 's' : ''} earned · ${stage.name} stage`}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
