import React from 'react';
import { Box, Button, ButtonGroup, Tooltip } from '@mui/material';
import SentimentVeryDissatisfiedIcon from '@mui/icons-material/SentimentVeryDissatisfied';
import SentimentNeutralIcon from '@mui/icons-material/SentimentNeutral';
import SentimentSatisfiedAltIcon from '@mui/icons-material/SentimentSatisfiedAlt';

const AssessmentSelector = ({ value, onChange }) => {
  const handleChange = (newValue) => {
    onChange(newValue);
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <ButtonGroup variant="outlined" size="large" fullWidth>
        <Tooltip title="Struggling - Needs a lot of help">
          <Button
            onClick={() => handleChange('struggling')}
            color="error"
            variant={value === 'struggling' ? 'contained' : 'outlined'}
            startIcon={<SentimentVeryDissatisfiedIcon />}
            sx={{ 
              py: 1.5,
              borderRadius: '8px 0 0 8px',
              flex: 1
            }}
          >
            Struggling
          </Button>
        </Tooltip>
        
        <Tooltip title="Needs some help">
          <Button
            onClick={() => handleChange('needs-help')}
            color="warning"
            variant={value === 'needs-help' ? 'contained' : 'outlined'}
            startIcon={<SentimentNeutralIcon />}
            sx={{ 
              py: 1.5,
              flex: 1
            }}
          >
            Needs Help
          </Button>
        </Tooltip>
        
        <Tooltip title="Independent - Little help needed">
          <Button
            onClick={() => handleChange('independent')}
            color="success"
            variant={value === 'independent' ? 'contained' : 'outlined'}
            startIcon={<SentimentSatisfiedAltIcon />}
            sx={{ 
              py: 1.5,
              borderRadius: '0 8px 8px 0',
              flex: 1
            }}
          >
            Independent
          </Button>
        </Tooltip>
      </ButtonGroup>
    </Box>
  );
};

export default AssessmentSelector;