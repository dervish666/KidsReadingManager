import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Chip,
  Skeleton,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
  HourglassEmpty as PendingIcon,
  Block as DeclinedIcon,
} from '@mui/icons-material';

const formatRelativeTime = (isoDate) => {
  if (!isoDate) return '\u2014';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
};

const isSyncStale = (school) =>
  school.wondeSchoolId &&
  school.wondeLastSyncAt &&
  Date.now() - new Date(school.wondeLastSyncAt).getTime() > 7 * 24 * 60 * 60 * 1000;

const hasSchoolErrors = (school) =>
  school.subscriptionStatus === 'past_due' ||
  isSyncStale(school) ||
  (school.wondeSchoolId && !school.hasWondeToken) ||
  (school.wondeSchoolId && school.lastSyncError);

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

const WONDE_STATUS_CONFIG = {
  approved: { label: 'Approved', color: 'success', Icon: null },
  pending: { label: 'Pending', color: 'warning', Icon: PendingIcon },
  declined: { label: 'Declined', color: 'error', Icon: DeclinedIcon },
};

const COLUMNS = [
  { id: 'name', label: 'School' },
  { id: 'source', label: 'Source', sortable: false },
  { id: 'wondeStatus', label: 'Wonde Status', sortable: false },
  { id: 'subscriptionStatus', label: 'Billing' },
  { id: 'wondeLastSyncAt', label: 'Last Sync' },
  { id: 'town', label: 'Town' },
];

const SchoolTable = ({
  schools,
  wondeSchools = [],
  pagination,
  filters,
  sort,
  loading,
  onFilterChange,
  onSortChange,
  onPageChange,
  onRowClick,
  onAddClick,
}) => {
  // Build set of wonde IDs already in D1 (approved schools that became orgs)
  const existingWondeIds = new Set(
    schools.filter((s) => s.wondeSchoolId).map((s) => s.wondeSchoolId)
  );

  // Pending/declined schools not yet in D1
  const extraWondeSchools = wondeSchools
    .filter((ws) => !existingWondeIds.has(ws.wondeId) && ws.wondeStatus !== 'approved')
    .filter((ws) => {
      if (!filters.search) return true;
      const q = filters.search.toLowerCase();
      return ws.name?.toLowerCase().includes(q) || ws.town?.toLowerCase().includes(q);
    })
    .filter((ws) => {
      if (!filters.wondeStatus || filters.wondeStatus === 'all') return true;
      return ws.wondeStatus === filters.wondeStatus;
    });

  // Annotate existing schools with their Wonde status
  const wondeStatusMap = new Map(wondeSchools.map((ws) => [ws.wondeId, ws.wondeStatus]));

  // Filter existing D1 schools by wondeStatus if set
  const filteredSchools =
    filters.wondeStatus && filters.wondeStatus !== 'all'
      ? schools.filter((s) => {
          if (!s.wondeSchoolId) return filters.wondeStatus === 'manual';
          return wondeStatusMap.get(s.wondeSchoolId) === filters.wondeStatus;
        })
      : schools;

  const handleSearchChange = (e) => {
    onFilterChange({ ...filters, search: e.target.value });
  };

  const handleFilterChange = (field) => (e) => {
    onFilterChange({ ...filters, [field]: e.target.value });
  };

  const handleSortClick = (field) => {
    if (sort.field === field) {
      onSortChange({ field, order: sort.order === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ field, order: 'asc' });
    }
  };

  const handlePageChange = (_event, newPage) => {
    onPageChange(newPage + 1);
  };

  return (
    <Paper sx={{ bgcolor: 'rgba(250, 248, 243, 0.8)' }}>
      {/* Toolbar */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'center',
        }}
      >
        <TextField
          size="small"
          placeholder="Search schools..."
          value={filters.search}
          onChange={handleSearchChange}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 200, flex: '1 1 200px', maxWidth: 320 }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Source</InputLabel>
          <Select value={filters.source} label="Source" onChange={handleFilterChange('source')}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="wonde">Wonde</MenuItem>
            <MenuItem value="manual">Manual</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Billing</InputLabel>
          <Select value={filters.billing} label="Billing" onChange={handleFilterChange('billing')}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="trialing">Trialing</MenuItem>
            <MenuItem value="past_due">Past Due</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
            <MenuItem value="none">None</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Sync Status</InputLabel>
          <Select
            value={filters.syncStatus}
            label="Sync Status"
            onChange={handleFilterChange('syncStatus')}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="recent">Recent</MenuItem>
            <MenuItem value="stale">Stale</MenuItem>
            <MenuItem value="never">Never</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Wonde Status</InputLabel>
          <Select
            value={filters.wondeStatus}
            label="Wonde Status"
            onChange={handleFilterChange('wondeStatus')}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="declined">Declined</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Errors</InputLabel>
          <Select
            value={filters.hasErrors}
            label="Errors"
            onChange={handleFilterChange('hasErrors')}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="yes">Has Errors</MenuItem>
            <MenuItem value="no">No Errors</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ flex: '1 1 0', display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={onAddClick}
            sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
          >
            Add School
          </Button>
        </Box>
      </Box>

      {/* Table */}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              {COLUMNS.map((col) => (
                <TableCell
                  key={col.id}
                  sx={{ color: 'white', fontWeight: 600 }}
                  sortDirection={sort.field === col.id ? sort.order : false}
                >
                  {col.sortable === false ? (
                    col.label
                  ) : (
                    <TableSortLabel
                      active={sort.field === col.id}
                      direction={sort.field === col.id ? sort.order : 'asc'}
                      onClick={() => handleSortClick(col.id)}
                      sx={{
                        color: 'white !important',
                        '&:hover': { color: 'white !important' },
                        '& .MuiTableSortLabel-icon': { color: 'white !important' },
                        '&.Mui-active': { color: 'white !important' },
                        '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' },
                      }}
                    >
                      {col.label}
                    </TableSortLabel>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {COLUMNS.map((col) => (
                    <TableCell key={col.id}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredSchools.length === 0 && extraWondeSchools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} align="center" sx={{ py: 6 }}>
                  <Typography variant="body1" color="text.secondary">
                    No schools found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {/* Pending/declined Wonde schools (not yet in D1) */}
                {extraWondeSchools.map((ws) => {
                  const statusConfig = WONDE_STATUS_CONFIG[ws.wondeStatus] || {};
                  return (
                    <TableRow
                      key={`wonde-${ws.wondeId}`}
                      sx={{
                        opacity: 0.85,
                        bgcolor:
                          ws.wondeStatus === 'pending'
                            ? 'rgba(255, 244, 229, 0.5)'
                            : 'rgba(255, 235, 238, 0.4)',
                      }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {statusConfig.Icon && (
                            <statusConfig.Icon
                              sx={{
                                fontSize: 18,
                                color: `${statusConfig.color}.main`,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: 'text.primary' }}
                          >
                            {ws.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label="Wonde"
                          size="small"
                          color="success"
                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={statusConfig.label}
                          size="small"
                          color={statusConfig.color}
                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {'\u2014'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {'\u2014'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {ws.town || '\u2014'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* Existing D1 schools */}
                {filteredSchools.map((school) => {
                  const errorRow = hasSchoolErrors(school);
                  const stale = isSyncStale(school);
                  const isWonde = Boolean(school.wondeSchoolId);
                  const billingColor = BILLING_CHIP_COLOR[school.subscriptionStatus] || 'default';
                  const schoolWondeStatus = isWonde
                    ? wondeStatusMap.get(school.wondeSchoolId) || 'approved'
                    : null;
                  const statusConfig = schoolWondeStatus
                    ? WONDE_STATUS_CONFIG[schoolWondeStatus]
                    : null;

                  return (
                    <TableRow
                      key={school.id}
                      onClick={() => onRowClick(school)}
                      sx={{
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease',
                        '&:hover': { bgcolor: 'action.hover' },
                        ...(errorRow && { bgcolor: 'rgba(255, 248, 246, 0.8)' }),
                      }}
                    >
                      {/* School name */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {isWonde && school.lastSyncError && (
                            <WarningIcon
                              sx={{ fontSize: 18, color: 'warning.main', flexShrink: 0 }}
                            />
                          )}
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: 'text.primary' }}
                          >
                            {school.name}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Source */}
                      <TableCell>
                        <Chip
                          label={isWonde ? 'Wonde' : 'Manual'}
                          size="small"
                          color={isWonde ? 'success' : 'default'}
                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                        />
                      </TableCell>

                      {/* Wonde Status */}
                      <TableCell>
                        {statusConfig ? (
                          <Chip
                            label={statusConfig.label}
                            size="small"
                            color={statusConfig.color}
                            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {'\u2014'}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Billing */}
                      <TableCell>
                        <Chip
                          label={formatBillingLabel(school.subscriptionStatus)}
                          size="small"
                          color={billingColor}
                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                        />
                      </TableCell>

                      {/* Last Sync */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {stale && (
                            <WarningIcon
                              sx={{ fontSize: 16, color: 'warning.main', flexShrink: 0 }}
                            />
                          )}
                          <Typography variant="body2" color="text.secondary">
                            {formatRelativeTime(school.wondeLastSyncAt)}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Town */}
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {school.town || '\u2014'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {!loading && pagination.total > 0 && (
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page - 1}
          rowsPerPage={pagination.pageSize}
          onPageChange={handlePageChange}
          rowsPerPageOptions={[pagination.pageSize]}
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        />
      )}
    </Paper>
  );
};

export default SchoolTable;
