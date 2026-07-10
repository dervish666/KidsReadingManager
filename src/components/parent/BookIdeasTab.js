import React from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import RecCard from './RecCard';
import { sectionTitleSx } from './parentPortalStyles';

/**
 * Book Ideas tab body. Presentational — the fetch/caching state lives in
 * ParentPortal (the tab unmounts on switch, and the loaded-once cache must
 * survive that so re-opening the tab doesn't refetch).
 */
const BookIdeasTab = ({ firstName, bookIdeas, loading, onOpenDetail }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" sx={{ ...sectionTitleSx, mb: 0.5 }}>
      Book ideas for {firstName}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Great next books for {firstName} to enjoy — ones to borrow from school and ideas to discover
      together.
    </Typography>

    {loading ? (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
        <CircularProgress sx={{ color: 'parent.accent' }} />
      </Box>
    ) : bookIdeas.ai.length === 0 && bookIdeas.library.length === 0 ? (
      <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
        <Typography sx={{ fontSize: 44, mb: 1 }}>📚</Typography>
        <Typography variant="body2" color="text.secondary">
          No book ideas just yet. As {firstName} reads more, suggestions will appear here for you
          to explore together.
        </Typography>
      </Box>
    ) : (
      <>
        {/* Teacher/AI-chosen picks */}
        {bookIdeas.ai.length > 0 && (
          <Box sx={{ mb: bookIdeas.library.length > 0 ? 3 : 0 }}>
            <Typography
              variant="caption"
              sx={{ ...sectionTitleSx, display: 'block', mb: 1, fontSize: '0.8rem' }}
            >
              ✨ Chosen for {firstName}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {bookIdeas.ai.map((rec, i) => (
                <RecCard
                  key={`ai-${rec.title}-${i}`}
                  rec={rec}
                  onClick={() => onOpenDetail(rec)}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Live matches from the school's own library — borrowable */}
        {bookIdeas.library.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{ ...sectionTitleSx, display: 'block', mb: 1, fontSize: '0.8rem' }}
            >
              📖 From the school library — ready to borrow
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {bookIdeas.library.map((rec, i) => (
                <RecCard
                  key={`lib-${rec.title}-${i}`}
                  rec={rec}
                  onClick={() => onOpenDetail(rec)}
                />
              ))}
            </Box>
          </Box>
        )}
      </>
    )}
  </Box>
);

export default BookIdeasTab;
