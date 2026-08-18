import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createContext, useContext } from 'react';

// Create a test context to mock AuthContext
const TestAuthContext = createContext();

// Mock the AuthContext module (Login uses useAuth)
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useContext(TestAuthContext),
}));

// Import Login after mocking
import Login from '../../components/Login';

// Mock AuthContext provider wrapper
const createWrapper = (contextValue) => {
  return ({ children }) => (
    <TestAuthContext.Provider value={contextValue}>{children}</TestAuthContext.Provider>
  );
};

// Default mock context values
const createMockContext = (overrides = {}) => ({
  login: vi.fn(),
  loginWithEmail: vi.fn(),
  register: vi.fn(),
  apiError: null,
  isMultiTenantMode: false,
  serverAuthModeDetected: true,
  ...overrides,
});

describe('Login Component', () => {
  describe('Loading State', () => {
    it('should show loading when server auth mode not detected', () => {
      const context = createMockContext({ serverAuthModeDetected: false });

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Multi-Tenant Mode (Email/Password)', () => {
    it('should render email and password form in multi-tenant mode', () => {
      const context = createMockContext({ isMultiTenantMode: true });

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByText('Sign in to your account.')).toBeInTheDocument();
    });

    it('should show forgot password link in multi-tenant mode', () => {
      const context = createMockContext({ isMultiTenantMode: true });

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByText(/forgot your password/i)).toBeInTheDocument();
    });

    it('should disable login button when email or password is empty', () => {
      const context = createMockContext({ isMultiTenantMode: true });

      render(<Login />, { wrapper: createWrapper(context) });

      const loginButton = screen.getByRole('button', { name: 'Login' });
      expect(loginButton).toBeDisabled();
    });

    it('should enable login button when both email and password are entered', async () => {
      const context = createMockContext({ isMultiTenantMode: true });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const loginButton = screen.getByRole('button', { name: 'Login' });
      expect(loginButton).not.toBeDisabled();
    });

    it('should call loginWithEmail on form submit', async () => {
      const mockLoginWithEmail = vi.fn().mockResolvedValue(undefined);
      const context = createMockContext({
        isMultiTenantMode: true,
        loginWithEmail: mockLoginWithEmail,
      });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const loginButton = screen.getByRole('button', { name: 'Login' });
      await user.click(loginButton);

      expect(mockLoginWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should show error when email is missing', async () => {
      const context = createMockContext({ isMultiTenantMode: true });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const passwordInput = screen.getByLabelText('Password');
      await user.type(passwordInput, 'password123');

      // Button should still be disabled
      const loginButton = screen.getByRole('button', { name: 'Login' });
      expect(loginButton).toBeDisabled();
    });

    it('should display API error from context', () => {
      const context = createMockContext({
        isMultiTenantMode: true,
        apiError: 'Server error occurred',
      });

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Server error occurred')).toBeInTheDocument();
    });
  });

  describe('Common UI Elements', () => {
    it('should display app title', () => {
      const context = createMockContext();

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Tally Reading')).toBeInTheDocument();
    });

  });
});
