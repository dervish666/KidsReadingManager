import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  Paper,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  useMediaQuery,
  useTheme,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InboxIcon from '@mui/icons-material/Inbox';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonIcon from '@mui/icons-material/Person';
import { useAuth } from '../contexts/AuthContext';
import { formatRelativeTime } from '../utils/helpers';

const STATUS_CONFIG = {
  open: {
    label: 'Open',
    backgroundColor: 'rgba(155, 110, 58, 0.1)',
    color: 'status.needsAttention',
  },
  'in-progress': {
    label: 'In Progress',
    backgroundColor: 'rgba(122, 158, 173, 0.12)',
    color: 'info.main',
  },
  resolved: {
    label: 'Resolved',
    backgroundColor: 'rgba(74, 110, 74, 0.1)',
    color: 'status.recentlyRead',
  },
};

const StatusChip = ({ status, size = 'small' }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <Chip
      label={config.label}
      size={size}
      sx={{
        backgroundColor: config.backgroundColor,
        color: config.color,
        fontFamily: '"DM Sans", sans-serif',
        fontWeight: 600,
        fontSize: size === 'small' ? '0.75rem' : '0.8rem',
      }}
    />
  );
};

const SupportTicketManager = () => {
  const { fetchWithAuth } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [notes, setNotes] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const fetchTickets = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/support');
      if (response && typeof response.json === 'function') {
        const data = await response.json();
        setTickets(data.tickets || []);
      } else {
        setTickets(response?.tickets || []);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  const fetchTicketDetail = useCallback(
    async (ticketId) => {
      setDetailLoading(true);
      try {
        const response = await fetchWithAuth(`/api/support/${ticketId}`);
        let data;
        if (response && typeof response.json === 'function') {
          data = await response.json();
        } else {
          data = response;
        }
        setTicketDetail(data.ticket || null);
        setNotes(data.notes || []);
      } catch {
        setTicketDetail(null);
        setNotes([]);
        setError('Something went wrong. Please try again.');
      } finally {
        setDetailLoading(false);
      }
    },
    [fetchWithAuth]
  );

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (selectedTicketId) {
      fetchTicketDetail(selectedTicketId);
    }
  }, [selectedTicketId, fetchTicketDetail]);

  const handleSelectTicket = useCallback((ticketId) => {
    setSelectedTicketId(ticketId);
    setNewNote('');
  }, []);

  const handleStatusChange = useCallback(
    async (newStatus) => {
      if (!selectedTicketId || !ticketDetail) return;
      const previousStatus = ticketDetail.status;
      // Optimistic update
      setTicketDetail((prev) => (prev ? { ...prev, status: newStatus } : prev));
      setTickets((prev) =>
        prev.map((t) => (t.id === selectedTicketId ? { ...t, status: newStatus } : t))
      );
      try {
        const response = await fetchWithAuth(`/api/support/${selectedTicketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (response && typeof response.json === 'function') {
          const data = await response.json();
          if (!data.success) throw new Error('Failed');
        }
        // Refresh both to get accurate data
        fetchTickets();
        fetchTicketDetail(selectedTicketId);
      } catch {
        // Revert on failure
        setTicketDetail((prev) => (prev ? { ...prev, status: previousStatus } : prev));
        setTickets((prev) =>
          prev.map((t) => (t.id === selectedTicketId ? { ...t, status: previousStatus } : t))
        );
        setError('Something went wrong. Please try again.');
      }
    },
    [selectedTicketId, ticketDetail, fetchWithAuth, fetchTickets, fetchTicketDetail]
  );

  const handleAddNote = useCallback(async () => {
    if (!selectedTicketId || !newNote.trim()) return;
    setNoteSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/support/${selectedTicketId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      let data;
      if (response && typeof response.json === 'function') {
        data = await response.json();
      } else {
        data = response;
      }
      if (data.success) {
        setNewNote('');
        fetchTicketDetail(selectedTicketId);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setNoteSubmitting(false);
    }
  }, [selectedTicketId, newNote, fetchWithAuth, fetchTicketDetail]);

  const handleDeleteTicket = useCallback(async () => {
    if (!selectedTicketId) return;
    if (!window.confirm('Delete this ticket and all its notes?')) return;
    try {
      const response = await fetchWithAuth(`/api/support/${selectedTicketId}`, {
        method: 'DELETE',
      });
      let data;
      if (response && typeof response.json === 'function') {
        data = await response.json();
      } else {
        data = response;
      }
      if (data.success) {
        setSelectedTicketId(null);
        setTicketDetail(null);
        setNotes([]);
        fetchTickets();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }
  }, [selectedTicketId, fetchWithAuth, fetchTickets]);

  const statusCounts = useMemo(() => {
    const counts = { all: tickets.length, open: 0, 'in-progress': 0, resolved: 0 };
    tickets.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      }
    });
    return counts;
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (statusFilter === 'all') return tickets;
    return tickets.filter((t) => t.status === statusFilter);
  }, [tickets, statusFilter]);

  const handleBack = useCallback(() => {
    setSelectedTicketId(null);
    setTicketDetail(null);
    setNotes([]);
    setNewNote('');
  }, []);

  // On mobile, show detail if a ticket is selected, otherwise show list
  const showDetail = isMobile && selectedTicketId;
  const showList = !isMobile || !selectedTicketId;

  const filterChips = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'resolved', label: 'Resolved' },
  ];

  // ─── Left Panel: Ticket List ───────────────────────────────────────

  const renderTicketList = () => (
    <Box
      sx={{
        width: isMobile ? '100%' : '40%',
        minWidth: isMobile ? 'auto' : 340,
        borderRight: isMobile ? 'none' : '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Filter chips */}
      <Box sx={{ p: 2, pb: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {filterChips.map(({ key, label }) => (
            <Chip
              key={key}
              label={`${label} (${statusCounts[key]})`}
              onClick={() => setStatusFilter(key)}
              variant={statusFilter === key ? 'filled' : 'outlined'}
              sx={{
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: statusFilter === key ? 700 : 500,
                fontSize: '0.8rem',
                backgroundColor: statusFilter === key ? 'primary.main' : 'transparent',
                color: statusFilter === key ? 'primary.contrastText' : 'text.primary',
                borderColor: statusFilter === key ? 'primary.main' : 'rgba(0,0,0,0.15)',
                '&:hover': {
                  backgroundColor:
                    statusFilter === key ? 'primary.dark' : 'rgba(107, 142, 107, 0.08)',
                },
              }}
            />
          ))}
        </Box>
      </Box>

      <Divider />

      {/* Ticket list */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
            <CircularProgress size={32} sx={{ color: 'primary.main' }} />
          </Box>
        ) : filteredTickets.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <InboxIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography
              sx={{
                fontFamily: '"DM Sans", sans-serif',
                color: 'text.secondary',
                fontSize: '0.9rem',
              }}
            >
              {statusFilter === 'all' ? 'No support tickets yet' : `No ${statusFilter} tickets`}
            </Typography>
          </Box>
        ) : (
          filteredTickets.map((ticket) => (
            <Paper
              key={ticket.id}
              elevation={0}
              onClick={() => handleSelectTicket(ticket.id)}
              sx={{
                p: 2,
                mb: 1,
                cursor: 'pointer',
                borderRadius: '12px',
                border: '1px solid',
                borderColor:
                  selectedTicketId === ticket.id ? 'rgba(107, 142, 107, 0.4)' : 'rgba(0,0,0,0.06)',
                backgroundColor:
                  selectedTicketId === ticket.id ? 'rgba(107, 142, 107, 0.08)' : 'background.paper',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: 'rgba(107, 142, 107, 0.3)',
                  backgroundColor:
                    selectedTicketId === ticket.id
                      ? 'rgba(107, 142, 107, 0.08)'
                      : 'rgba(107, 142, 107, 0.03)',
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  mb: 0.5,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: '"Nunito", sans-serif',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    color: 'text.primary',
                    flex: 1,
                    mr: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ticket.subject}
                </Typography>
                <StatusChip status={ticket.status} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography
                  sx={{
                    fontFamily: '"DM Sans", sans-serif',
                    fontSize: '0.8rem',
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    mr: 1,
                  }}
                >
                  {ticket.userName}
                  {ticket.organizationName ? ` \u00B7 ${ticket.organizationName}` : ''}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: '"DM Sans", sans-serif',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatRelativeTime(ticket.createdAt)}
                </Typography>
              </Box>
            </Paper>
          ))
        )}
      </Box>
    </Box>
  );

  // ─── Right Panel: Ticket Detail ────────────────────────────────────

  const renderTicketDetail = () => (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {!selectedTicketId ? (
        // Empty state
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            py: 6,
          }}
        >
          <SupportAgentIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 2 }} />
          <Typography
            sx={{
              fontFamily: '"Nunito", sans-serif',
              fontWeight: 700,
              fontSize: '1.1rem',
              color: 'text.secondary',
            }}
          >
            Select a ticket to view details
          </Typography>
        </Box>
      ) : detailLoading ? (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6, flex: 1 }}
        >
          <CircularProgress size={32} sx={{ color: 'primary.main' }} />
        </Box>
      ) : ticketDetail ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* Header */}
          <Box sx={{ p: 2.5, pb: 2 }}>
            {isMobile && (
              <IconButton
                onClick={handleBack}
                sx={{ mr: 1, mb: 1, ml: -1 }}
                aria-label="Back to ticket list"
              >
                <ArrowBackIcon />
              </IconButton>
            )}
            <Typography
              variant="h6"
              sx={{
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 800,
                color: 'text.primary',
                mb: 1.5,
                lineHeight: 1.3,
              }}
            >
              {ticketDetail.subject}
            </Typography>

            {/* Info block */}
            <Box
              sx={{
                backgroundColor: 'rgba(107, 142, 107, 0.06)',
                borderRadius: '10px',
                p: 2,
                mb: 2,
              }}
            >
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography
                    sx={{
                      fontFamily: '"DM Sans", sans-serif',
                      fontSize: '0.85rem',
                      color: 'text.primary',
                    }}
                  >
                    {ticketDetail.userName}
                  </Typography>
                </Box>
                {ticketDetail.userEmail && (
                  <Typography
                    sx={{
                      fontFamily: '"DM Sans", sans-serif',
                      fontSize: '0.85rem',
                      color: 'text.secondary',
                    }}
                  >
                    {ticketDetail.userEmail}
                  </Typography>
                )}
                {ticketDetail.organizationName && (
                  <Chip
                    label={ticketDetail.organizationName}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontFamily: '"DM Sans", sans-serif',
                      fontSize: '0.75rem',
                      borderColor: 'rgba(0,0,0,0.12)',
                      color: 'text.primary',
                    }}
                  />
                )}
                {ticketDetail.pageUrl && (
                  <Chip
                    label={ticketDetail.pageUrl}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontFamily: '"DM Sans", sans-serif',
                      fontSize: '0.75rem',
                      borderColor: 'rgba(0,0,0,0.12)',
                      color: 'text.primary',
                    }}
                  />
                )}
                <Typography
                  sx={{
                    fontFamily: '"DM Sans", sans-serif',
                    fontSize: '0.8rem',
                    color: 'text.secondary',
                  }}
                >
                  {formatRelativeTime(ticketDetail.createdAt)}
                </Typography>
              </Box>
            </Box>

            {/* Message */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                backgroundColor: 'background.paper',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '10px',
                mb: 2,
              }}
            >
              <Typography
                sx={{
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '0.9rem',
                  color: 'text.primary',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ticketDetail.message}
              </Typography>
            </Paper>

            {/* Status control */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel sx={{ fontFamily: '"DM Sans", sans-serif' }}>Status</InputLabel>
                <Select
                  value={ticketDetail.status}
                  label="Status"
                  onChange={(e) => handleStatusChange(e.target.value)}
                  sx={{
                    fontFamily: '"DM Sans", sans-serif',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                  }}
                >
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="in-progress">In Progress</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                </Select>
              </FormControl>
              <StatusChip status={ticketDetail.status} size="medium" />
              <Box sx={{ flex: 1 }} />
              <IconButton
                onClick={handleDeleteTicket}
                size="small"
                aria-label="Delete ticket"
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'error.dark', backgroundColor: 'rgba(166, 101, 101, 0.08)' },
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          <Divider />

          {/* Notes section */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
            <Typography
              sx={{
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 700,
                fontSize: '1rem',
                color: 'text.primary',
                mb: 2,
              }}
            >
              Notes {notes.length > 0 && `(${notes.length})`}
            </Typography>

            {notes.length === 0 ? (
              <Typography
                sx={{
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '0.85rem',
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                No notes yet. Add the first note below.
              </Typography>
            ) : (
              <Box sx={{ mb: 2 }}>
                {notes.map((note) => (
                  <Box
                    key={note.id}
                    sx={{
                      mb: 1.5,
                      pl: 2,
                      borderLeft: '3px solid rgba(107, 142, 107, 0.3)',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography
                        sx={{
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: 'text.primary',
                        }}
                      >
                        {note.userName}
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '0.75rem',
                          color: 'text.secondary',
                        }}
                      >
                        {formatRelativeTime(note.createdAt)}
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontFamily: '"DM Sans", sans-serif',
                        fontSize: '0.85rem',
                        color: 'text.primary',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {note.note}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* Add note */}
          <Divider />
          <Box sx={{ p: 2, backgroundColor: 'rgba(0,0,0,0.015)' }}>
            <TextField
              fullWidth
              multiline
              rows={2}
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              disabled={noteSubmitting}
              inputProps={{ maxLength: 2000 }}
              sx={{
                mb: 1.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '0.9rem',
                  backgroundColor: 'background.paper',
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                sx={{
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                }}
              >
                {newNote.length}/2000
              </Typography>
              <Button
                variant="contained"
                onClick={handleAddNote}
                disabled={!newNote.trim() || noteSubmitting}
                startIcon={
                  noteSubmitting ? <CircularProgress size={16} color="inherit" /> : <NoteAddIcon />
                }
                sx={{
                  backgroundColor: 'primary.main',
                  textTransform: 'none',
                  fontFamily: '"DM Sans", sans-serif',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  borderRadius: '10px',
                  px: 2.5,
                  '&:hover': { backgroundColor: 'primary.dark' },
                  '&.Mui-disabled': { backgroundColor: 'rgba(107, 142, 107, 0.3)' },
                }}
              >
                {noteSubmitting ? 'Adding...' : 'Add Note'}
              </Button>
            </Box>
          </Box>
        </Box>
      ) : (
        // Failed to load
        <Box
          sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6, flex: 1 }}
        >
          <Typography sx={{ fontFamily: '"DM Sans", sans-serif', color: 'text.secondary' }}>
            Failed to load ticket details.
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography
          variant="h5"
          sx={{
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            color: 'text.primary',
          }}
        >
          Support Tickets
        </Typography>
        <Typography
          sx={{
            fontFamily: '"DM Sans", sans-serif',
            color: 'text.secondary',
            fontSize: '0.9rem',
            mt: 0.5,
          }}
        >
          View and manage support requests from users.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: '16px',
          overflow: 'hidden',
          backgroundColor: 'background.paper',
          height: 600,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        {showList && renderTicketList()}
        {(!isMobile || showDetail) && renderTicketDetail()}
      </Paper>
    </Box>
  );
};

export default SupportTicketManager;
