import React from 'react';
import { Box, Typography, LinearProgress, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';

const VisualIndicators = ({ data }) => {
  const theme = useTheme();
  
  // Calculate total for percentages
  const total = data.notRead + data.needsAttention + data.recentlyRead;
  
  // Prevent division by zero
  if (total === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No data available
        </Typography>
      </Box>
    );
  }
  
  // Calculate percentages
  const notReadPercent = Math.round((data.notRead / total) * 100);
  const needsAttentionPercent = Math.round((data.needsAttention / total) * 100);
  const recentlyReadPercent = Math.round((data.recentlyRead / total) * 100);
  
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ width: '100%', mr: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Needs Reading
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {notReadPercent}% ({data.notRead} students)
            </Typography>
          </Box>
          <Tooltip title={`${data.notRead} students need reading`}>
            <LinearProgress
              variant="determinate"
              value={notReadPercent}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: 'rgba(244, 67, 54, 0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: theme.palette.status.notRead,
                  borderRadius: 5,
                },
              }}
            />
          </Tooltip>
        </Box>
      </Box>
      
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ width: '100%', mr: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Read Recently
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {needsAttentionPercent}% ({data.needsAttention} students)
            </Typography>
          </Box>
          <Tooltip title={`${data.needsAttention} students read with recently`}>
            <LinearProgress
              variant="determinate"
              value={needsAttentionPercent}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: 'rgba(255, 152, 0, 0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: theme.palette.status.needsAttention,
                  borderRadius: 5,
                },
              }}
            />
          </Tooltip>
        </Box>
      </Box>
      
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Box sx={{ width: '100%', mr: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Up to Date
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {recentlyReadPercent}% ({data.recentlyRead} students)
            </Typography>
          </Box>
          <Tooltip title={`${data.recentlyRead} students are up to date`}>
            <LinearProgress
              variant="determinate"
              value={recentlyReadPercent}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: 'rgba(76, 175, 80, 0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: theme.palette.status.recentlyRead,
                  borderRadius: 5,
                },
              }}
            />
          </Tooltip>
        </Box>
      </Box>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          0%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          50%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          100%
        </Typography>
      </Box>
    </Box>
  );
};

export default VisualIndicators;