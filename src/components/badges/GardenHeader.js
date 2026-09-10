import React from 'react';
import { Box, Typography } from '@mui/material';

// One painted scene per stage. The scene carries the ground, sky, beds,
// fence and path; only the growing plant and the signpost are layered on top.
// Before v3.131.0 the header was a CSS gradient with a dozen cut-out sprites
// floated at hand-typed percentages, which is why it read as clip-art.
import sceneSeedling from '../../assets/garden-scene-seedling.webp';
import sceneSprout from '../../assets/garden-scene-sprout.webp';
import sceneBloom from '../../assets/garden-scene-bloom.webp';
import sceneFullGarden from '../../assets/garden-scene-full-garden.webp';

// Growth stages for the central plant (swapped as badges accumulate)
import gardenGrow1 from '../../assets/garden-seedling.webp';
import gardenGrow2 from '../../assets/garden-grow-2.webp';
import gardenGrow3 from '../../assets/garden-grow-3.webp';
import gardenGrow4 from '../../assets/garden-grow-4.webp';
import gardenSignpost from '../../assets/garden-signpost-04.webp';
import {
  STAGES,
  getStage,
  stageFromApiName,
  goalsToEffectiveBadgeCount,
} from '../../utils/gardenStages';

// Re-exported for existing importers; the canonical tables live in utils/gardenStages
export { STAGES, getStage };

// Scene per STAGES index (Seedling, Sprout, Bloom, Full Garden)
const SCENES = [sceneSeedling, sceneSprout, sceneBloom, sceneFullGarden];

// Growth stages: the central plant evolves through 4 images
export const GROWTH_STAGES = [
  { src: gardenGrow1, minBadges: 1, height: '34%' },
  { src: gardenGrow2, minBadges: 5, height: '44%' },
  { src: gardenGrow3, minBadges: 9, height: '52%' },
  { src: gardenGrow4, minBadges: 13, height: '58%' },
];

export function getCurrentGrowth(badgeCount) {
  let current = null;
  for (const stage of GROWTH_STAGES) {
    if (badgeCount >= stage.minBadges) current = stage;
  }
  return current;
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
  const sceneIndex = Math.max(0, STAGES.indexOf(stage));

  // When goalsCompleted is provided (class goals), map it to an effective badge count
  const effectiveBadgeCount =
    goalsCompleted != null ? goalsToEffectiveBadgeCount(goalsCompleted) : badgeCount;

  const subtitle = label || (studentName ? `${studentName}'s Reading Garden` : 'Reading Garden');
  const growth = getCurrentGrowth(effectiveBadgeCount);
  const badgeLine = `${badgeCount} badge${badgeCount !== 1 ? 's' : ''} earned`;

  return (
    <Box
      role="img"
      aria-label={`${subtitle}, ${stage.name} stage`}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px 12px 0 0',
        height,
        background: '#F7F1DF',
      }}
    >
      {/* Painted scene, cross-faded when the stage changes */}
      {SCENES.map((src, i) => (
        <Box
          key={src}
          component="img"
          src={src}
          alt=""
          aria-hidden="true"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 72%',
            opacity: i === sceneIndex ? 1 : 0,
            transition: 'opacity 0.9s ease',
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Growing central plant, swaps through 4 growth stages */}
      {GROWTH_STAGES.map((gs) => {
        const isActive = growth && growth.src === gs.src;
        return (
          <Box
            key={gs.minBadges}
            component="img"
            src={gs.src}
            alt=""
            aria-hidden="true"
            sx={{
              position: 'absolute',
              left: '47%',
              bottom: '9%',
              height: gs.height,
              width: 'auto',
              objectFit: 'contain',
              transformOrigin: 'bottom center',
              opacity: isActive ? 1 : 0,
              transform: isActive
                ? 'translateX(-50%) scale(1)'
                : 'translateX(-50%) scale(0.8) translateY(6px)',
              transition: 'opacity 0.8s ease, transform 0.8s ease',
              pointerEvents: 'none',
              filter: 'drop-shadow(0 2px 3px rgba(60,40,20,0.18))',
            }}
          />
        );
      })}

      {/* Signpost with stage label */}
      <Box
        sx={{
          position: 'absolute',
          right: '4%',
          bottom: '6%',
          height: '52%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <Box
          component="img"
          src={gardenSignpost}
          alt=""
          aria-hidden="true"
          sx={{
            height: '100%',
            width: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 2px 3px rgba(60,40,20,0.18))',
          }}
        />
        <Typography
          aria-hidden="true"
          sx={{
            position: 'absolute',
            color: '#5D4E37',
            fontFamily: '"Nunito", "DM Sans", sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(0.65rem, 1.8vw, 0.9rem)',
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
            background: 'linear-gradient(transparent, rgba(255,254,249,0.82))',
            pt: 2.5,
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ color: '#4A5A3A', fontWeight: 700, fontSize: '0.85rem' }}
          >
            {subtitle}
          </Typography>
          {!stageProp && (
            <Typography variant="caption" sx={{ color: '#4A5A3A', fontSize: '0.75rem' }}>
              {badgeLine}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
