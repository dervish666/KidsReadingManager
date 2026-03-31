import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeProvider } from '@mui/material';
import theme from '../../styles/theme';

// Mock useAuth
const mockFetchWithAuth = vi.fn();
const mockLogout = vi.fn();
let mockUserRole = 'teacher';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    userRole: mockUserRole,
    fetchWithAuth: mockFetchWithAuth,
    logout: mockLogout,
  }),
}));

import SubscriptionBlockedScreen from '../../components/SubscriptionBlockedScreen';

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('SubscriptionBlockedScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'teacher';
  });

  it('should show "contact your administrator" for teacher role', () => {
    renderWithTheme(<SubscriptionBlockedScreen />);
    expect(screen.getByText(/contact your school administrator/i)).toBeTruthy();
    expect(screen.queryByText(/manage billing/i)).toBeFalsy();
  });

  it('should show "Manage Billing" button for admin role', () => {
    mockUserRole = 'admin';
    renderWithTheme(<SubscriptionBlockedScreen />);
    expect(screen.getByText(/manage billing/i)).toBeTruthy();
  });

  it('should show logout button', () => {
    renderWithTheme(<SubscriptionBlockedScreen />);
    expect(screen.getByText(/log out/i)).toBeTruthy();
  });

  it('should call logout when Log Out is clicked', () => {
    renderWithTheme(<SubscriptionBlockedScreen />);
    fireEvent.click(screen.getByText(/log out/i));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should show "Manage Billing" button for owner role', () => {
    mockUserRole = 'owner';
    renderWithTheme(<SubscriptionBlockedScreen />);
    expect(screen.getByText(/manage billing/i)).toBeTruthy();
  });

  it('should show TallyLogo', () => {
    const { container } = renderWithTheme(<SubscriptionBlockedScreen />);
    const logo = container.querySelector('svg');
    expect(logo).toBeTruthy();
  });

  it('should show subscription cancelled heading', () => {
    renderWithTheme(<SubscriptionBlockedScreen />);
    expect(screen.getByText(/subscription cancelled/i)).toBeTruthy();
  });

  it('should show Contact Support button', () => {
    renderWithTheme(<SubscriptionBlockedScreen />);
    const supportButton = screen.getByText(/contact support/i);
    expect(supportButton).toBeTruthy();
    expect(supportButton.closest('a')).toHaveAttribute('href', 'mailto:support@tallyreading.uk');
  });
});
