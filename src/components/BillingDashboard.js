import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Box,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLOURS = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  cancelled: 'error',
  none: 'default',
};

export default function BillingDashboard() {
  const { fetchWithAuth } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchWithAuth('/api/billing/schools')
      .then((r) => r.json())
      .then((data) => setOrgs(data.schools || []))
      .catch(() => {});
  }, [fetchWithAuth]);

  const filtered = filter === 'all' ? orgs : orgs.filter((o) => o.subscriptionStatus === filter);

  // Determine Stripe dashboard base URL (test vs live)
  // In production, remove '/test' from the URL
  const stripeBase = 'https://dashboard.stripe.com/test';

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(e, v) => v && setFilter(v)}
          size="small"
        >
          <ToggleButton value="all">All ({orgs.length})</ToggleButton>
          <ToggleButton value="trialing">Trialing</ToggleButton>
          <ToggleButton value="active">Active</ToggleButton>
          <ToggleButton value="past_due">Past Due</ToggleButton>
          <ToggleButton value="cancelled">Cancelled</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>School</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Plan</TableCell>
            <TableCell>AI</TableCell>
            <TableCell>Next Date</TableCell>
            <TableCell>Stripe</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filtered.map((org) => (
            <TableRow key={org.id}>
              <TableCell>{org.name}</TableCell>
              <TableCell>
                <Chip
                  label={org.subscriptionStatus || 'none'}
                  color={STATUS_COLOURS[org.subscriptionStatus] || 'default'}
                  size="small"
                />
              </TableCell>
              <TableCell>{org.subscriptionPlan || '\u2014'}</TableCell>
              <TableCell>
                {org.aiAddonActive && (
                  <Chip label="AI" color="secondary" size="small" variant="outlined" />
                )}
              </TableCell>
              <TableCell>
                {org.subscriptionStatus === 'trialing' && org.trialEndsAt
                  ? `Trial ends ${new Date(org.trialEndsAt).toLocaleDateString()}`
                  : org.currentPeriodEnd
                    ? new Date(org.currentPeriodEnd).toLocaleDateString()
                    : '\u2014'}
              </TableCell>
              <TableCell>
                {org.stripeCustomerId && (
                  <IconButton
                    size="small"
                    href={`${stripeBase}/customers/${org.stripeCustomerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <OpenInNew fontSize="small" />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
