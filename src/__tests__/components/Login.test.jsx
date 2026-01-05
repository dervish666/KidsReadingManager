import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createContext, useContext } from 'react';

// Create a test context to mock AppContext
const TestAppContext = createContext();

// Mock the AppContext module
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => useContext(TestAppContext)
}));

// Import Login after mocking
import Login from '../../components/Login';

// Mock AppContext provider wrapper
const createWrapper = (contextValue) => {
  return ({ children }) => (
    <TestAppContext.Provider value={contextValue}>
      {children}
    </TestAppContext.Provider>
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
  ...overrides
});

describe('Login Component', () => {
  describe('Loading State', () => {
    it('should show loading when server auth mode not detected', () => {
      const context = createMockContext({ serverAuthModeDetected: false });

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Legacy Mode (Simple Password)', () => {
    it('should render legacy password form when not in multi-tenant mode', () => {
      const context = createMockContext({ isMultiTenantMode: false });

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument();
      expect(screen.getByText('Enter the access password to continue.')).toBeInTheDocument();
    });

    it('should disable login button when password is empty', () => {
      const context = createMockContext({ isMultiTenantMode: false });

      render(<Login />, { wrapper: createWrapper(context) });

      const loginButton = screen.getByRole('button', { name: /login/i });
      expect(loginButton).toBeDisabled();
    });

    it('should enable login button when password is entered', async () => {
      const context = createMockContext({ isMultiTenantMode: false });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const passwordInput = screen.getByPlaceholderText('Password');
      await user.type(passwordInput, 'testpassword');

      const loginButton = screen.getByRole('button', { name: /login/i });
      expect(loginButton).not.toBeDisabled();
    });

    it('should call login function with password on submit', async () => {
      const mockLogin = vi.fn().mockResolvedValue(undefined);
      const context = createMockContext({
        isMultiTenantMode: false,
        login: mockLogin
      });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const passwordInput = screen.getByPlaceholderText('Password');
      await user.type(passwordInput, 'testpassword');

      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);

      expect(mockLogin).toHaveBeenCalledWith('testpassword');
    });

    it('should display error message on login failure', async () => {
      const mockLogin = vi.fn().mockRejectedValue(new Error('Invalid password'));
      const context = createMockContext({
        isMultiTenantMode: false,
        login: mockLogin
      });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const passwordInput = screen.getByPlaceholderText('Password');
      await user.type(passwordInput, 'wrongpassword');

      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid password')).toBeInTheDocument();
      });
    });

    it('should show submitting state while logging in', async () => {
      const mockLogin = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      const context = createMockContext({
        isMultiTenantMode: false,
        login: mockLogin
      });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const passwordInput = screen.getByPlaceholderText('Password');
      await user.type(passwordInput, 'testpassword');

      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);

      expect(screen.getByText('Logging in...')).toBeInTheDocument();
    });

    it('should handle missing login function gracefully', async () => {
      const context = createMockContext({
        isMultiTenantMode: false,
        login: undefined
      });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const passwordInput = screen.getByPlaceholderText('Password');
      await user.type(passwordInput, 'testpassword');

      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText(/login function not available/i)).toBeInTheDocument();
      });
    });
  });

  describe('Multi-Tenant Mode (Email/Password)', () => {
    it('should render email and password form in multi-tenant mode', () => {
      const context = createMockContext({ isMultiTenantMode: true });

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
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

      const loginButton = screen.getByRole('button', { name: /login/i });
      expect(loginButton).toBeDisabled();
    });

    it('should enable login button when both email and password are entered', async () => {
      const context = createMockContext({ isMultiTenantMode: true });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const loginButton = screen.getByRole('button', { name: /login/i });
      expect(loginButton).not.toBeDisabled();
    });

    it('should call loginWithEmail on form submit', async () => {
      const mockLoginWithEmail = vi.fn().mockResolvedValue(undefined);
      const context = createMockContext({
        isMultiTenantMode: true,
        loginWithEmail: mockLoginWithEmail
      });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);

      expect(mockLoginWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should show error when email is missing', async () => {
      const context = createMockContext({ isMultiTenantMode: true });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const passwordInput = screen.getByPlaceholderText('Password');
      await user.type(passwordInput, 'password123');

      // Button should still be disabled
      const loginButton = screen.getByRole('button', { name: /login/i });
      expect(loginButton).toBeDisabled();
    });

    it('should display API error from context', () => {
      const context = createMockContext({
        isMultiTenantMode: true,
        apiError: 'Server error occurred'
      });

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Server error occurred')).toBeInTheDocument();
    });
  });

  describe('Common UI Elements', () => {
    it('should display app title', () => {
      const context = createMockContext();

      render(<Login />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Kids Reading Manager')).toBeInTheDocument();
    });

    it('should clear password field on successful login', async () => {
      const mockLogin = vi.fn().mockResolvedValue(undefined);
      const context = createMockContext({
        isMultiTenantMode: false,
        login: mockLogin
      });
      const user = userEvent.setup();

      render(<Login />, { wrapper: createWrapper(context) });

      const passwordInput = screen.getByPlaceholderText('Password');
      await user.type(passwordInput, 'testpassword');

      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);

      await waitFor(() => {
        expect(passwordInput).toHaveValue('');
      });
    });
  });
});
