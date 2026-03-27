import React from 'react';
import { AuthProvider } from './AuthContext';
import { DataProvider } from './DataContext';
import { UIProvider } from './UIContext';

// Re-export hooks for convenience
export { useAuth } from './AuthContext';
export { useData } from './DataContext';
export { useUI } from './UIContext';

/**
 * Composed provider that nests AuthProvider > DataProvider > UIProvider.
 *
 * DataContext depends on AuthContext (for fetchWithAuth, isAuthenticated, etc.)
 * UIContext depends on both AuthContext and DataContext (for students, readingStatusSettings, etc.)
 */
export const AppProvider = ({ children }) => (
  <AuthProvider>
    <DataProvider>
      <UIProvider>{children}</UIProvider>
    </DataProvider>
  </AuthProvider>
);
