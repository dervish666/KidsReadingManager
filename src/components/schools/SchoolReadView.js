import React from 'react';
import { Box, Typography, Chip, Button, Divider, Alert, Switch } from '@mui/material';
import { Edit as EditIcon, Sync as SyncIcon } from '@mui/icons-material';

const BILLING_CHIP_COLOR = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  cancelled: 'error',
};

const formatBillingLabel = (status) => {
  if (!status) return 'None';
  const label = status.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const formatDate = (isoDate) => {
  if (!isoDate) return null;
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const cardSx = {
  bgcolor: 'rgba(250, 248, 243, 0.8)',
  borderRadius: 2,
  p: 2,
  mb: 2,
};

const gridSx = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '4px 12px',
};

const LabelValue = ({ label, value }) => (
  <>
    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
      {label}
    </Typography>
    <Typography variant="body2" color="text.secondary" component="div">
      {value != null && value !== '' ? value : '\u2014'}
    </Typography>
  </>
);

const SchoolReadView = ({ school, onEdit, onSync, onStartTrial, onOpenPortal, onDeactivate, onToggleAi, onClearAiKey, loading }) => {
  if (!school) return null;

  const isWonde = Boolean(school.wondeSchoolId);
  const billingColor = BILLING_CHIP_COLOR[school.subscriptionStatus] || 'default';
  const hasBilling = school.subscriptionStatus && school.subscriptionStatus !== 'none';

  const addressParts = [
    school.addressLine1,
    school.addressLine2,
    school.town,
    school.postcode,
  ].filter(Boolean);

  return (
    <Box>
      {/* Header */}
      <Typography variant="h5" sx={{ mb: 1 }}>
        {school.name}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip
          label={isWonde ? 'Wonde' : 'Manual'}
          size="small"
          color={isWonde ? 'success' : 'default'}
          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
        />
        <Chip
          label={formatBillingLabel(school.subscriptionStatus)}
          size="small"
          color={billingColor}
          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
        />
      </Box>

      {/* Actions row */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit} sx={{ minHeight: 44 }}>
          Edit
        </Button>
        {isWonde && (
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={onSync}
            sx={{ minHeight: 44 }}
          >
            Sync Now
          </Button>
        )}
      </Box>

      {/* Contact card */}
      <Box sx={cardSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Contact
        </Typography>
        <Box sx={gridSx}>
          <LabelValue label="Email" value={school.contactEmail} />
          <LabelValue label="Billing" value={school.billingEmail} />
          <LabelValue label="Phone" value={school.phone} />
        </Box>
      </Box>

      {/* Address card */}
      <Box sx={cardSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Address
        </Typography>
        {addressParts.length > 0 ? (
          <Typography variant="body2" color="text.secondary">
            {addressParts.map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {'\u2014'}
          </Typography>
        )}
      </Box>

      {/* Billing card */}
      <Box sx={cardSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Billing
        </Typography>
        <Box sx={gridSx}>
          <LabelValue
            label="Status"
            value={
              <Chip
                label={formatBillingLabel(school.subscriptionStatus)}
                size="small"
                color={billingColor}
                sx={{ fontWeight: 600, fontSize: '0.75rem' }}
              />
            }
          />
          <LabelValue label="Plan" value={school.subscriptionPlan} />
          <LabelValue
            label="AI Add-on"
            value={
              <Switch
                checked={school.aiAddonActive}
                onChange={(e) => onToggleAi(e.target.checked)}
                disabled={loading}
                size="small"
              />
            }
          />
          {school.aiAddonActive && (
            <LabelValue
              label="AI Key"
              value={
                school.hasAiKey ? (
                  <Chip
                    label="Own key → Use platform"
                    size="small"
                    color="info"
                    onClick={() => onClearAiKey()}
                    disabled={loading}
                    sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }}
                  />
                ) : (
                  <Chip
                    label="Platform"
                    size="small"
                    color="success"
                    sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                  />
                )
              }
            />
          )}
          {school.subscriptionStatus === 'trialing' && (
            <LabelValue label="Trial ends" value={formatDate(school.trialEndsAt)} />
          )}
        </Box>
        <Box sx={{ mt: 2 }}>
          {hasBilling ? (
            <Button fullWidth variant="outlined" onClick={onOpenPortal} sx={{ minHeight: 44 }}>
              Open Billing Portal
            </Button>
          ) : (
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={onStartTrial}
              sx={{ minHeight: 44 }}
            >
              Start 30-day Free Trial
            </Button>
          )}
        </Box>
      </Box>

      {/* Wonde card */}
      {isWonde && (
        <Box sx={cardSx}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Wonde Integration
          </Typography>
          <Box sx={gridSx}>
            <LabelValue
              label="School ID"
              value={
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                >
                  {school.wondeSchoolId}
                </Typography>
              }
            />
            <LabelValue
              label="Token"
              value={
                school.hasWondeToken ? (
                  <Typography component="span" variant="body2" sx={{ color: 'success.main' }}>
                    {'✓ Set'}
                  </Typography>
                ) : (
                  <Typography component="span" variant="body2" sx={{ color: 'warning.main' }}>
                    {'⚠ Not set'}
                  </Typography>
                )
              }
            />
            <LabelValue label="Last sync" value={formatDate(school.wondeLastSyncAt) || 'Never'} />
            <LabelValue label="Students" value={school.studentCount} />
            <LabelValue label="Classes" value={school.classCount} />
          </Box>
          {school.lastSyncError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {school.lastSyncError}
            </Alert>
          )}
        </Box>
      )}

      {/* Deactivate section */}
      <Divider sx={{ my: 2 }} />
      <Button
        fullWidth
        variant="outlined"
        color="error"
        onClick={onDeactivate}
        sx={{ minHeight: 44 }}
      >
        Deactivate School
      </Button>
    </Box>
  );
};

export default SchoolReadView;
