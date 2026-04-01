import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';

const MultipleCountDialog = ({ open, onClose, onConfirm, count, onCountChange }) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>How many days of reading?</DialogTitle>
      <DialogContent>
        <TextField
          type="number"
          value={count}
          onChange={(e) => onCountChange(Math.max(2, parseInt(e.target.value) || 5))}
          inputProps={{ min: 2, max: 14 }}
          fullWidth
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} variant="contained" color="primary">
          Record {count} Days
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MultipleCountDialog;
