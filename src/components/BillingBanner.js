import { useState, useEffect } from 'react';
import { Alert, AlertTitle, Button } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export default function BillingBanner() {
  const { fetchWithAuth, user } = useAuth();
  const [billing, setBilling] = useState(null);

  useEffect(() => {
    // Only fetch for admin+ roles
    if (!user || (user.role !== 'admin' && user.role !== 'owner')) return;

    fetchWithAuth('/api/billing/status')
      .then((r) => {
        if (!r.ok) throw new Error(`billing status ${r.status}`);
        return r.json();
      })
      .then(setBilling)
      // A failed check must not silently hide a past-due warning — show a
      // quiet "couldn't check" state instead of nothing.
      .catch(() => setBilling({ status: 'unknown' }));
  }, [fetchWithAuth, user]);

  if (!billing || billing.status === 'active' || billing.status === 'none') {
    return null;
  }

  if (billing.status === 'unknown') {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        We couldn&apos;t check your billing status just now — if you were expecting a billing
        notice, refresh the page or check Settings → Billing.
      </Alert>
    );
  }

  const handleManageBilling = async () => {
    try {
      const res = await fetchWithAuth('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch {
      // Silently fail — user can retry
    }
  };

  if (billing.status === 'trialing') {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        <AlertTitle>Free Trial</AlertTitle>
        You have {billing.daysRemaining} day{billing.daysRemaining !== 1 ? 's' : ''} remaining on
        your free trial.
        <Button size="small" onClick={handleManageBilling} sx={{ ml: 2 }}>
          Set up billing
        </Button>
      </Alert>
    );
  }

  if (billing.status === 'past_due') {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>Payment Overdue</AlertTitle>
        Your subscription payment is overdue. Please update your payment details to avoid losing
        access.
        <Button size="small" color="warning" onClick={handleManageBilling} sx={{ ml: 2 }}>
          Update payment
        </Button>
      </Alert>
    );
  }

  if (billing.status === 'cancelled') {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        <AlertTitle>Subscription Cancelled</AlertTitle>
        Your subscription has been cancelled. Please contact support to reactivate.
      </Alert>
    );
  }

  return null;
}
