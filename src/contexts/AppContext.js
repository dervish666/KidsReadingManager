import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { DataProvider, useData } from './DataContext';
import { UIProvider, useUI } from './UIContext';

/**
 * Backwards-compatible wrapper that composes AuthContext, DataContext, and UIContext.
 *
 * All existing consumers that call `useAppContext()` continue to work unchanged
 * because this hook merges all three context values into a single object.
 *
 * New code should prefer the domain-specific hooks: useAuth(), useData(), useUI().
 */
export const useAppContext = () => {
  const auth = useAuth();
  const data = useData();
  const ui = useUI();
  return { ...auth, ...data, ...ui };
};

/**
 * Composed provider that nests AuthProvider > DataProvider > UIProvider.
 *
 * DataContext depends on AuthContext (for fetchWithAuth, isAuthenticated, etc.)
 * UIContext depends on both AuthContext and DataContext (for students, readingStatusSettings, etc.)
 */
export const AppProvider = ({ children }) => {
  return (
    <AuthProvider>
      <DataProvider>
        <UIProvider>{children}</UIProvider>
      </DataProvider>
    </AuthProvider>
  );
};
