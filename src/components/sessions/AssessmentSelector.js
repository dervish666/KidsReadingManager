import React from 'react';
import { Box, Button, Tooltip, Stack } from '@mui/material';
import SentimentVeryDissatisfiedIcon from '@mui/icons-material/SentimentVeryDissatisfied';
import SentimentNeutralIcon from '@mui/icons-material/SentimentNeutral';
import SentimentSatisfiedAltIcon from '@mui/icons-material/SentimentSatisfiedAlt';

const AssessmentSelector = ({ value, onChange }) => {
  const handleChange = (newValue) => {
    onChange(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Replace ButtonGroup with Stack for better layout control in MUI v7 */}
      <Stack
        direction="row"
        spacing={0}
        sx={{
          width: '100%',
          '& > *': { flex: 1 } // Make all children take equal space
        }}
      >
        <Tooltip title="Needing Help - Requires additional support">
          <Button
            onClick={() => handleChange('struggling')}
            color="error"
            variant={value === 'struggling' ? 'contained' : 'outlined'}
            startIcon={<SentimentVeryDissatisfiedIcon />}
            sx={{
              py: 1.5,
              borderRadius: '8px 0 0 8px',
              width: '100%'
            }}
          >
            Needing Help
          </Button>
        </Tooltip>

        <Tooltip title="Moderate Help - Benefits from some guidance">
          <Button
            onClick={() => handleChange('needs-help')}
            color="warning"
            variant={value === 'needs-help' ? 'contained' : 'outlined'}
            startIcon={<SentimentNeutralIcon />}
            sx={{
              py: 1.5,
              borderRadius: 0,
              width: '100%'
            }}
          >
            Moderate Help
          </Button>
        </Tooltip>

        <Tooltip title="Independent - Strong, self-directed reader">
          <Button
            onClick={() => handleChange('independent')}
            color="success"
            variant={value === 'independent' ? 'contained' : 'outlined'}
            startIcon={<SentimentSatisfiedAltIcon />}
            sx={{
              py: 1.5,
              borderRadius: '0 8px 8px 0',
              width: '100%'
            }}
          >
            Independent
          </Button>
        </Tooltip>
      </Stack>
    </Box>
  );
};

export default AssessmentSelector;