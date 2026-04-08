import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { setFetchFunction as setHardcoverFetch } from '../utils/hardcoverApi.js';

// Create context
const AuthContext = createContext();

// API URL - relative path since frontend and API are served from the same origin
const API_URL = '/api';
const AUTH_STORAGE_KEY = 'krm_auth_token';
const USER_STORAGE_KEY = 'krm_user';
const AUTH_MODE_KEY = 'krm_auth_mode';

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// Helper to decode JWT payload (without verification - just for reading claims)
const decodeJwtPayload = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
};

// Check if token is expired (with 60 second buffer)
const isTokenExpired = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  return Date.now() >= payload.exp * 1000 - 60000;
};

export const AuthProvider = ({ children }) => {
  // State for API errors
  const [apiError, setApiError] = useState(null);

  // Track if server auth mode has been detected
  const [serverAuthModeDetected, setServerAuthModeDetected] = useState(false);
  // Track if SSO (MyLogin) is enabled on the server
  const [ssoEnabled, setSsoEnabled] = useState(false);

  // Multi-tenant auth state - initially null until detected from server
  const [authMode, setAuthMode] = useState(() => {
    if (typeof window === 'undefined') return 'multitenant';
    try {
      return window.localStorage.getItem(AUTH_MODE_KEY) || 'multitenant';
    } catch {
      return 'multitenant';
    }
  });

  // Auth token (from localStorage if present)
  const [authToken, setAuthToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(AUTH_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  // User info for multi-tenant mode
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.localStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Ref to always hold the latest auth token (avoids stale closure in fetchWithAuth)
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  // Track in-flight token refresh promise so concurrent callers share it
  const refreshingToken = useRef(null);

  // Available organizations (for owners to switch between)
  const [availableOrganizations, setAvailableOrganizations] = useState([]);
  // Active organization ID (for owners switching between orgs)
  const [activeOrganizationId, setActiveOrganizationId] = useState(null);
  const activeOrgIdRef = useRef(activeOrganizationId);
  activeOrgIdRef.current = activeOrganizationId;
  // Loading state for organization switching
  const [switchingOrganization, setSwitchingOrganization] = useState(false);

  // Subscription block state: null (ok), 'past_due' (read-only), 'cancelled' (fully blocked)
  const [subscriptionBlock, setSubscriptionBlock] = useState(null);

  // Detect auth mode from server on startup
  useEffect(() => {
    const detectAuthMode = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/mode`);
        if (response.ok) {
          const data = await response.json();

          // Update SSO availability from server
          setSsoEnabled(Boolean(data.ssoEnabled));

          // Update auth mode based on server response
          if (data.mode === 'multitenant') {
            setAuthMode('multitenant');
            try {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(AUTH_MODE_KEY, 'multitenant');
              }
            } catch {
              // ignore
            }
          } else {
            // If server is in legacy mode but we have multitenant tokens, clear them
            if (authMode === 'multitenant' && !authToken) {
              setAuthMode('legacy');
              try {
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(AUTH_MODE_KEY, 'legacy');
                }
              } catch {
                // ignore
              }
            }
          }
          setServerAuthModeDetected(true);
        } else {
          setServerAuthModeDetected(true);
        }
      } catch (err) {
        setServerAuthModeDetected(true);
      }

      // Check for OAuth SSO callback or error
      const urlParams = new URLSearchParams(window.location.search);
      const authParam = urlParams.get('auth');
      const authReason = urlParams.get('reason');

      if (authParam === 'error') {
        // SSO failed — surface the reason to the user
        window.history.replaceState({}, '', window.location.pathname);
        const reasonMessages = {
          invalid_state: 'Login session expired. Please try again.',
          token_exchange_failed: 'Authentication failed. Please try again.',
          user_fetch_failed: 'Could not retrieve your account. Please try again.',
          no_school:
            "Your account isn't linked to a school. Please contact your school administrator.",
          school_not_found:
            "Your school hasn't been set up on Tally Reading yet. Please ask your school administrator to get in touch with us.",
          internal: 'An unexpected error occurred. Please try again.',
        };
        setApiError(
          reasonMessages[authReason] || `Login failed: ${authReason || 'unknown error'}`
        );
      } else if (authParam === 'callback') {
        // Remove query param from URL (clean up)
        window.history.replaceState({}, '', window.location.pathname);
        // Complete SSO login by exchanging the httpOnly refresh cookie for an access token.
        // Retry with backoff — the redirect sets the cookie, but the browser may not have
        // persisted it by the time this runs (observed on slow connections).
        const maxRetries = 3;
        let lastError = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              await new Promise((r) => setTimeout(r, 500 * attempt));
            }
            const response = await fetch(`${API_URL}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
            });
            if (response.ok) {
              const data = await response.json();
              setAuthToken(data.accessToken);
              try {
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(AUTH_STORAGE_KEY, data.accessToken);
                }
              } catch {
                /* ignore */
              }
              if (data.user) {
                // Merge organization info into user object
                const userWithOrg = {
                  ...data.user,
                  organizationId: data.organization?.id || data.user.organizationId,
                  organizationName: data.organization?.name || data.user.organizationName,
                  organizationSlug: data.organization?.slug || data.user.organizationSlug,
                };
                setUser(userWithOrg);
                try {
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userWithOrg));
                  }
                } catch {
                  /* ignore */
                }
                // Auto-set class filter on fresh SSO login
                if (data.user.assignedClassIds && data.user.assignedClassIds.length > 0) {
                  try {
                    window.sessionStorage.setItem(
                      'pendingClassAutoFilter',
                      JSON.stringify(data.user.assignedClassIds)
                    );
                  } catch {
                    /* ignore */
                  }
                }
              }
              lastError = null;
              break; // success — stop retrying
            } else {
              const errData = await response.json().catch(() => ({}));
              lastError = errData.error || 'could not complete sign-in';
            }
          } catch (err) {
            console.error(`SSO callback attempt ${attempt + 1} failed:`, err);
            lastError = 'network error';
          }
        }
        if (lastError) {
          setApiError(`SSO login failed: ${lastError}`);
        }
      }
    };

    detectAuthMode();
  }, []); // Run once on mount

  // Clear all auth state
  const clearAuthState = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        window.localStorage.removeItem(USER_STORAGE_KEY);
        window.localStorage.removeItem('bookCovers');
        window.sessionStorage.clear();
        // Don't remove AUTH_MODE_KEY - preserve the server's detected auth mode
      }
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    // Don't reset authMode - preserve the server's detected auth mode
  }, []);

  // Token refresh function for multi-tenant mode
  // Uses a shared promise so concurrent callers all await the same refresh
  const refreshAccessToken = useCallback(async () => {
    // If a refresh is already in flight, return the existing promise
    if (refreshingToken.current) {
      return refreshingToken.current;
    }

    const refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Include httpOnly cookies
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          clearAuthState();
          return null;
        }

        const data = await response.json();
        const newToken = data.accessToken;

        if (newToken) {
          setAuthToken(newToken);
          try {
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(AUTH_STORAGE_KEY, newToken);
            }
          } catch {
            // ignore
          }
          return newToken;
        }

        return null;
      } catch (err) {
        clearAuthState();
        return null;
      } finally {
        refreshingToken.current = null;
      }
    })();

    refreshingToken.current = refreshPromise;
    return refreshPromise;
  }, [clearAuthState]);

  // Helper: fetch with auth header + 401 handling + token refresh
  const fetchWithAuth = useCallback(
    async (url, options = {}, retryCount = 0) => {
      // Read token from ref to avoid stale closure after refresh
      let currentToken = authTokenRef.current;

      // In multi-tenant mode, check if token needs refresh
      if (authMode === 'multitenant' && currentToken && isTokenExpired(currentToken)) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          currentToken = newToken;
        } else {
          setApiError('Session expired. Please log in again.');
          throw new Error('Session expired');
        }
      }

      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

      if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
      }

      // Include organization override header for owners switching orgs
      // Read from ref to avoid stale closure after switchOrganization
      if (activeOrgIdRef.current && user?.role === 'owner') {
        headers['X-Organization-Id'] = activeOrgIdRef.current;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        // In multi-tenant mode, try to refresh token once (skip for demo — no refresh token)
        if (authMode === 'multitenant' && retryCount === 0) {
          if (user?.authProvider !== 'demo') {
            const newToken = await refreshAccessToken();
            if (newToken) {
              return fetchWithAuth(url, options, retryCount + 1);
            }
          }
        }

        clearAuthState();
        if (user?.authProvider !== 'demo') {
          setApiError('Authentication required. Please log in.');
        }
        throw new Error('Unauthorized');
      }

      // Detect subscription blocks from 403 responses
      if (response.status === 403) {
        try {
          const cloned = response.clone();
          const body = await cloned.json();
          if (body.code === 'SUBSCRIPTION_PAST_DUE') {
            setSubscriptionBlock('past_due');
          } else if (body.code === 'SUBSCRIPTION_CANCELLED') {
            setSubscriptionBlock('cancelled');
          }
        } catch {
          // Not a subscription error — ignore
        }
      }

      return response;
    },
    [authMode, refreshAccessToken, clearAuthState, user]
  );

  // Inject fetchWithAuth into hardcoverApi so it uses the shared auth path
  useEffect(() => {
    setHardcoverFetch(fetchWithAuth);
  }, [fetchWithAuth]);

  // Legacy login helper (shared password)
  const login = useCallback(async (password) => {
    setApiError(null);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid password');
        }
        throw new Error(`Login failed: ${response.status} ${response.statusText}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (err) {
        throw new Error('Login failed: invalid JSON response');
      }

      const token = data && data.token;
      if (!token) {
        throw new Error('No token returned from server');
      }

      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(AUTH_STORAGE_KEY, token);
          window.localStorage.setItem(AUTH_MODE_KEY, 'legacy');
        }
      } catch (storageErr) {
        // Storage error is non-critical
      }

      setAuthToken(token);
      setAuthMode('legacy');
      setApiError(null);
    } catch (err) {
      setApiError(err.message || 'Login failed');
      throw err;
    }
  }, []);

  // Multi-tenant login with email/password
  const loginWithEmail = useCallback(async (email, password) => {
    setApiError(null);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include httpOnly cookies in response
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error(errorData.error || 'Invalid email or password');
        }
        throw new Error(errorData.error || `Login failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.accessToken) {
        throw new Error('No access token returned from server');
      }

      // Merge organization info into user object
      const userWithOrg = data.user
        ? {
            ...data.user,
            organizationId: data.organization?.id || data.user.organizationId,
            organizationName: data.organization?.name || data.user.organizationName,
            organizationSlug: data.organization?.slug || data.user.organizationSlug,
          }
        : null;

      // Store tokens and user info
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(AUTH_STORAGE_KEY, data.accessToken);
          window.localStorage.setItem(AUTH_MODE_KEY, 'multitenant');
          if (userWithOrg) {
            window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userWithOrg));
          }
        }
      } catch (storageErr) {
        // Storage error is non-critical
      }

      setAuthToken(data.accessToken);
      setUser(userWithOrg);
      setAuthMode('multitenant');
      setApiError(null);

      return userWithOrg;
    } catch (err) {
      setApiError(err.message || 'Login failed');
      throw err;
    }
  }, []);

  // Register new organization and user
  const register = useCallback(async (organizationName, userName, email, password) => {
    setApiError(null);

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include httpOnly cookies in response
        body: JSON.stringify({
          organizationName,
          name: userName,
          email,
          password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Registration failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.accessToken) {
        throw new Error('No access token returned from server');
      }

      // Merge organization info into user object
      const userWithOrg = data.user
        ? {
            ...data.user,
            organizationId: data.organization?.id || data.user.organizationId,
            organizationName: data.organization?.name || data.user.organizationName,
            organizationSlug: data.organization?.slug || data.user.organizationSlug,
          }
        : null;

      // Store tokens and user info
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(AUTH_STORAGE_KEY, data.accessToken);
          window.localStorage.setItem(AUTH_MODE_KEY, 'multitenant');
          if (userWithOrg) {
            window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userWithOrg));
          }
        }
      } catch (storageErr) {
        // Storage error is non-critical
      }

      setAuthToken(data.accessToken);
      setUser(userWithOrg);
      setAuthMode('multitenant');
      setApiError(null);

      return userWithOrg;
    } catch (err) {
      setApiError(err.message || 'Registration failed');
      throw err;
    }
  }, []);

  // Request password reset
  const forgotPassword = useCallback(async (email) => {
    setApiError(null);

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send reset email');
      }

      return true;
    } catch (err) {
      setApiError(err.message || 'Failed to send reset email');
      throw err;
    }
  }, []);

  // Reset password with token
  const resetPassword = useCallback(async (token, newPassword) => {
    setApiError(null);

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: newPassword }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to reset password');
      }

      return true;
    } catch (err) {
      setApiError(err.message || 'Failed to reset password');
      throw err;
    }
  }, []);

  // Fetch available organizations (for owners)
  const fetchAvailableOrganizations = useCallback(async () => {
    if (user?.role !== 'owner') {
      setAvailableOrganizations([]);
      return;
    }

    try {
      const response = await fetchWithAuth(`${API_URL}/organization/all`);
      if (response.ok) {
        const data = await response.json();
        setAvailableOrganizations(data.organizations || []);
      }
    } catch (error) {
      // Non-critical fetch failure
    }
  }, [user, fetchWithAuth]);

  // Logout helper
  const logout = useCallback(async () => {
    // Call logout endpoint to invalidate server-side session if applicable
    try {
      if (authMode === 'multitenant') {
        const isMyLoginUser = user?.authProvider === 'mylogin';

        if (isMyLoginUser) {
          // SSO logout: revoke token and get MyLogin logout URL
          const response = await fetch(`${API_URL}/auth/mylogin/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            credentials: 'include',
          });
          const data = await response.json();
          clearAuthState();
          if (data.logoutUrl) {
            window.location.href = data.logoutUrl;
            return;
          }
        } else {
          // Standard multi-tenant logout: invalidate refresh token
          await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            credentials: 'include',
            body: JSON.stringify({}),
          });
        }
      } else if (authMode === 'legacy' && authToken) {
        // Legacy mode: call logout endpoint for consistency
        await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        });
      }
    } catch {
      // Ignore logout API errors - client-side logout always works
    }

    clearAuthState();
    setApiError(null);
  }, [authMode, authToken, clearAuthState, user]);

  // Switch to a different organization (owners only)
  // DataContext watches activeOrganizationId and reloads automatically
  const switchOrganization = useCallback(
    async (orgId) => {
      if (user?.role !== 'owner') {
        return;
      }

      setSwitchingOrganization(true);
      activeOrgIdRef.current = orgId; // Update ref immediately so fetchWithAuth uses new org
      setActiveOrganizationId(orgId);

      // Reset class filter when switching organizations via sessionStorage
      // UIContext initializes from sessionStorage so it picks this up
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('globalClassFilter', 'all');
        } catch {
          // ignore
        }
      }
    },
    [user]
  );

  // Fetch available organizations for owners after user is loaded
  useEffect(() => {
    if (user && user?.role === 'owner') {
      fetchAvailableOrganizations();
    }
  }, [user, fetchAvailableOrganizations]);

  // Proactively fetch subscription status on auth load (all roles except owner)
  useEffect(() => {
    if (!authToken || !user || user.role === 'owner') {
      setSubscriptionBlock(null);
      return;
    }

    const checkSubscriptionStatus = async () => {
      try {
        const response = await fetchWithAuth(`${API_URL}/billing/subscription-status`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'cancelled' || data.status === 'canceled') {
            setSubscriptionBlock('cancelled');
          } else if (data.status === 'past_due') {
            setSubscriptionBlock('past_due');
          } else {
            setSubscriptionBlock(null);
          }
        }
      } catch {
        // Non-critical — reactive detection via fetchWithAuth is the fallback
      }
    };

    checkSubscriptionStatus();
  }, [authToken, user, fetchWithAuth]);

  // --- Derived auth state ---
  const isAuthenticated = !!authToken;
  const isMultiTenantMode = authMode === 'multitenant';

  // User role for RBAC
  const userRole = user?.role || null;

  // Organization info - use active org if owner has switched, otherwise from user state
  const organization = useMemo(() => {
    if (activeOrganizationId && userRole === 'owner') {
      const activeOrg = availableOrganizations.find((org) => org.id === activeOrganizationId);
      if (activeOrg) {
        return {
          id: activeOrg.id,
          name: activeOrg.name,
          slug: activeOrg.slug,
        };
      }
    }

    return user
      ? {
          id: user.organizationId,
          name: user.organizationName,
          slug: user.organizationSlug,
        }
      : null;
  }, [user, activeOrganizationId, availableOrganizations, userRole]);

  // Permission helpers
  const canManageUsers = userRole === 'owner' || userRole === 'admin';
  const canManageStudents = userRole !== 'readonly';
  const canManageClasses = userRole !== 'readonly';
  const canManageSettings = userRole === 'owner' || userRole === 'admin';

  const isReadOnly = subscriptionBlock === 'past_due';

  // Provider value - memoized to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      // Auth state
      authToken,
      authMode,
      serverAuthModeDetected,
      ssoEnabled,
      user,
      apiError,
      setApiError,
      isAuthenticated,
      isMultiTenantMode,
      userRole,
      organization,
      // Permission helpers
      canManageUsers,
      canManageStudents,
      canManageClasses,
      canManageSettings,
      // Subscription block
      subscriptionBlock,
      isReadOnly,
      // Organization switching
      availableOrganizations,
      activeOrganizationId,
      switchOrganization,
      switchingOrganization,
      setSwitchingOrganization,
      fetchAvailableOrganizations,
      // Auth functions
      fetchWithAuth,
      login,
      loginWithEmail,
      register,
      forgotPassword,
      resetPassword,
      logout,
    }),
    [
      authToken,
      authMode,
      serverAuthModeDetected,
      ssoEnabled,
      user,
      apiError,
      isAuthenticated,
      isMultiTenantMode,
      userRole,
      organization,
      canManageUsers,
      canManageStudents,
      canManageClasses,
      canManageSettings,
      subscriptionBlock,
      isReadOnly,
      availableOrganizations,
      activeOrganizationId,
      switchOrganization,
      switchingOrganization,
      fetchAvailableOrganizations,
      fetchWithAuth,
      login,
      loginWithEmail,
      register,
      forgotPassword,
      resetPassword,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
