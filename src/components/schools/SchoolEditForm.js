import React, { useState, useEffect } from 'react';
import { Box, TextField, Button, CircularProgress } from '@mui/material';

const emptyForm = {
  name: '',
  contactEmail: '',
  billingEmail: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  town: '',
  postcode: '',
  wondeSchoolToken: '',
};

const SchoolEditForm = ({ school, onSave, onCancel, loading }) => {
  const isAdd = !school;
  const [formData, setFormData] = useState(emptyForm);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (school) {
      setFormData({
        name: school.name || '',
        contactEmail: school.contactEmail || '',
        billingEmail: school.billingEmail || '',
        phone: school.phone || '',
        addressLine1: school.addressLine1 || '',
        addressLine2: school.addressLine2 || '',
        town: school.town || '',
        postcode: school.postcode || '',
        wondeSchoolToken: '',
      });
    } else {
      setFormData(emptyForm);
    }
    setNameError('');
  }, [school]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'name' && nameError) {
      setNameError('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setNameError('School name is required');
      return;
    }
    onSave(formData);
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}
    >
      <Box sx={{ flex: 1 }}>
        <TextField
          fullWidth
          margin="normal"
          label="School Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          error={Boolean(nameError)}
          helperText={nameError}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Contact Email"
          name="contactEmail"
          type="email"
          value={formData.contactEmail}
          onChange={handleChange}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Billing Email"
          name="billingEmail"
          type="email"
          value={formData.billingEmail}
          onChange={handleChange}
          helperText="Used for Stripe invoices. Falls back to contact email."
        />
        <TextField
          fullWidth
          margin="normal"
          label="Phone"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Address Line 1"
          name="addressLine1"
          value={formData.addressLine1}
          onChange={handleChange}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Address Line 2"
          name="addressLine2"
          value={formData.addressLine2}
          onChange={handleChange}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            margin="normal"
            label="Town"
            name="town"
            value={formData.town}
            onChange={handleChange}
            sx={{ flex: 2 }}
          />
          <TextField
            margin="normal"
            label="Postcode"
            name="postcode"
            value={formData.postcode}
            onChange={handleChange}
            sx={{ flex: 1 }}
          />
        </Box>
        {school?.wondeSchoolId && (
          <TextField
            fullWidth
            margin="normal"
            label="Wonde School Token"
            name="wondeSchoolToken"
            type="password"
            value={formData.wondeSchoolToken}
            onChange={handleChange}
            placeholder={school.hasWondeToken ? 'Token is set' : ''}
            helperText="Paste from Wonde dashboard. Encrypted at rest."
          />
        )}
      </Box>

      {/* Sticky save/cancel bar */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          pt: 2,
          pb: 1,
          display: 'flex',
          gap: 1,
        }}
      >
        <Button
          variant="outlined"
          fullWidth
          disabled={loading}
          onClick={onCancel}
          sx={{ minHeight: 44 }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{ minHeight: 44 }}
        >
          {loading ? <CircularProgress size={24} /> : isAdd ? 'Create School' : 'Save Changes'}
        </Button>
      </Box>
    </Box>
  );
};

export default SchoolEditForm;
