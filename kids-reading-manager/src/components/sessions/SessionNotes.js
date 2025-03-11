import React, { useState } from 'react';
import { 
  TextField, 
  Box, 
  Typography, 
  IconButton, 
  Tooltip,
  Collapse
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

const SessionNotes = ({ value, onChange }) => {
  const [expanded, setExpanded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  );
  
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const startSpeechRecognition = () => {
    if (!speechRecognitionSupported) return;
    
    // Use the browser's Speech Recognition API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
      setIsRecording(true);
    };
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      // Append to existing notes
      onChange({ target: { value: value ? `${value} ${transcript}` : transcript } });
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
    };
    
    recognition.onend = () => {
      setIsRecording(false);
    };
    
    recognition.start();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1">
          Notes
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {speechRecognitionSupported && (
          <Tooltip title="Add notes using voice (if supported by your browser)">
            <IconButton 
              onClick={startSpeechRecognition} 
              color={isRecording ? "error" : "default"}
              size="small"
            >
              <MicIcon />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={expanded ? "Hide notes" : "Show notes"}>
          <IconButton onClick={toggleExpanded} size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      
      <Collapse in={expanded} timeout="auto">
        <TextField
          multiline
          rows={4}
          value={value}
          onChange={onChange}
          placeholder="Enter notes about the reading session here..."
          fullWidth
          variant="outlined"
        />
      </Collapse>
      
      {!expanded && (
        <Box 
          onClick={toggleExpanded}
          sx={{ 
            p: 2, 
            border: '1px dashed #ccc', 
            borderRadius: 1, 
            textAlign: 'center',
            cursor: 'pointer',
            '&:hover': {
              bgcolor: 'rgba(0, 0, 0, 0.04)'
            }
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {value ? value.substring(0, 50) + (value.length > 50 ? '...' : '') : 'Click to add notes...'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SessionNotes;