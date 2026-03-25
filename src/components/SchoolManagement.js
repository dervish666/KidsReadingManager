import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Box, Typography, Alert } from '@mui/material';
import SchoolTable from './schools/SchoolTable';
import SchoolDrawer from './schools/SchoolDrawer';

const SchoolManagement = () => {
  const { fetchWithAuth } = useAppContext();

  const [schools, setSchools] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    search: '',
    source: 'all',
    billing: 'all',
    syncStatus: 'all',
    hasErrors: 'all',
  });
  const [sort, setSort] = useState({ field: 'name', order: 'asc' });
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [drawerMode, setDrawerMode] = useState('read'); // 'read' | 'edit' | 'add'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const searchTimerRef = useRef(null);

  // --- Data Fetching ---

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', pagination.page);
      params.set('pageSize', pagination.pageSize);
      params.set('sort', sort.field);
      params.set('order', sort.order);
      if (filters.search) params.set('search', filters.search);
      if (filters.source && filters.source !== 'all') params.set('source', filters.source);
      if (filters.billing && filters.billing !== 'all') params.set('billing', filters.billing);
      if (filters.syncStatus && filters.syncStatus !== 'all') params.set('syncStatus', filters.syncStatus);
      if (filters.hasErrors === 'yes') params.set('hasErrors', 'true');

      const res = await fetchWithAuth(`/api/organization/all?${params.toString()}`);
      const data = await res.json();
      const newSchools = data.organizations || [];
      setSchools(newSchools);
      if (data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages,
        }));
      }
      return newSchools;
    } catch (err) {
      setError('Failed to load schools');
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, filters, sort, pagination.page, pagination.pageSize]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  // --- Search Debouncing ---

  useEffect(() => {
    searchTimerRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }));
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchInput]);

  // --- Filter/Sort Handlers ---

  const handleFilterChange = useCallback(
    (newFilters) => {
      // Extract search changes — drive them through the debounce path
      if (newFilters.search !== undefined && newFilters.search !== searchInput) {
        setSearchInput(newFilters.search);
      }
      // Apply all non-search filter changes immediately
      const { search: _search, ...rest } = newFilters;
      setFilters((prev) => {
        const changed = Object.keys(rest).some((k) => rest[k] !== prev[k]);
        if (!changed) return prev;
        return { ...prev, ...rest };
      });
      setPagination((prev) => ({ ...prev, page: 1 }));
      setSelectedSchool(null);
    },
    [searchInput]
  );

  const handleSortChange = useCallback((newSort) => {
    setSort(newSort);
  }, []);

  const handlePageChange = useCallback((newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  }, []);

  // --- Drawer Handlers ---

  const handleRowClick = useCallback((school) => {
    setSelectedSchool(school);
    setDrawerMode('read');
  }, []);

  const handleAddClick = useCallback(() => {
    setSelectedSchool(null);
    setDrawerMode('add');
  }, []);

  const handleEdit = useCallback(() => {
    setDrawerMode('edit');
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedSchool(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (drawerMode === 'add') {
      setSelectedSchool(null);
    } else if (drawerMode === 'edit') {
      setDrawerMode('read');
    }
  }, [drawerMode]);

  // --- API Action Handlers ---

  const handleSave = useCallback(
    async (formData) => {
      setSaving(true);
      setError(null);
      try {
        if (drawerMode === 'add') {
          const res = await fetchWithAuth('/api/organization/create', {
            method: 'POST',
            body: JSON.stringify({ name: formData.name }),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to create school');
          }
          setSelectedSchool(null);
          await fetchSchools();
          setSuccess('School created successfully');
        } else if (drawerMode === 'edit') {
          const res = await fetchWithAuth(`/api/organization/${selectedSchool.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: formData.name,
              contactEmail: formData.contactEmail,
              billingEmail: formData.billingEmail,
              phone: formData.phone,
              addressLine1: formData.addressLine1,
              addressLine2: formData.addressLine2,
              town: formData.town,
              postcode: formData.postcode,
            }),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to update school');
          }

          if (formData.wondeSchoolToken?.trim() && selectedSchool.wondeSchoolId) {
            await fetchWithAuth('/api/wonde/token', {
              method: 'POST',
              body: JSON.stringify({
                schoolToken: formData.wondeSchoolToken.trim(),
                organizationId: selectedSchool.id,
              }),
            });
          }

          const newSchools = await fetchSchools();
          const updatedSchool = newSchools.find((s) => s.id === selectedSchool.id);
          if (updatedSchool) setSelectedSchool(updatedSchool);
          setDrawerMode('read');
          setSuccess('School updated successfully');
        }
      } catch (err) {
        setError(err.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [drawerMode, selectedSchool, fetchWithAuth, fetchSchools]
  );

  const handleSync = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/wonde/sync/${selectedSchool.id}`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Wonde sync failed');
      }
      const newSchools = await fetchSchools();
      const updatedSchool = newSchools.find((s) => s.id === selectedSchool.id);
      if (updatedSchool) setSelectedSchool(updatedSchool);
      setSuccess('Wonde sync completed');
    } catch (err) {
      setError(err.message || 'Wonde sync failed');
    } finally {
      setSaving(false);
    }
  }, [selectedSchool, fetchWithAuth, fetchSchools]);

  const handleStartTrial = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/billing/setup', {
        method: 'POST',
        body: JSON.stringify({ plan: 'monthly', organizationId: selectedSchool.id }),
      });
      const data = await res.json();
      if (data.status !== 'trialing') {
        throw new Error(data.error || 'Failed to start trial');
      }
      const newSchools = await fetchSchools();
      const updatedSchool = newSchools.find((s) => s.id === selectedSchool.id);
      if (updatedSchool) setSelectedSchool(updatedSchool);
      setSuccess('Trial started');
    } catch (err) {
      setError(err.message || 'Failed to start trial');
    } finally {
      setSaving(false);
    }
  }, [selectedSchool, fetchWithAuth, fetchSchools]);

  const handleOpenPortal = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/billing/portal', {
        method: 'POST',
        body: JSON.stringify({ organizationId: selectedSchool.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.error || 'Failed to open billing portal');
      }
    } catch (err) {
      setError(err.message || 'Failed to open billing portal');
    } finally {
      setSaving(false);
    }
  }, [selectedSchool, fetchWithAuth]);

  const handleDeactivate = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/organization/${selectedSchool.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to deactivate school');
      }
      setSelectedSchool(null);
      await fetchSchools();
      setSuccess('School deactivated successfully');
    } catch (err) {
      setError(err.message || 'Failed to deactivate school');
    } finally {
      setSaving(false);
    }
  }, [selectedSchool, fetchWithAuth, fetchSchools]);

  // --- Success Auto-Dismiss ---

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  // --- Render ---

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        School Management
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Manage schools and organizations in the system.
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <SchoolTable
        schools={schools}
        pagination={pagination}
        filters={{ ...filters, search: searchInput }}
        sort={sort}
        loading={loading}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
        onPageChange={handlePageChange}
        onRowClick={handleRowClick}
        onAddClick={handleAddClick}
      />

      <SchoolDrawer
        open={selectedSchool !== null || drawerMode === 'add'}
        school={selectedSchool}
        mode={drawerMode}
        loading={saving}
        onClose={handleCloseDrawer}
        onEdit={handleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onSync={handleSync}
        onStartTrial={handleStartTrial}
        onOpenPortal={handleOpenPortal}
        onDeactivate={handleDeactivate}
      />
    </Box>
  );
};

export default SchoolManagement;
