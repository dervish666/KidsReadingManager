import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Collapse,
  Stack,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../contexts/AuthContext';

const API_URL = '/api';

/**
 * Client-side mirror of validatePassword in utils/validation.js. The server is
 * still the authority — this only saves a round trip to be told the obvious.
 */
function passwordProblem(password) {
  if (password.length < 8) return 'At least 8 characters';
  if (password.length > 128) return 'No more than 128 characters';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Needs a capital letter, a small letter and a number';
  }
  return null;
}

/**
 * "Your account" block inside the profile dialog: change your display name and
 * your password without needing an administrator.
 *
 * What is deliberately NOT editable here:
 *   - **Email and username** are sign-in identifiers. A username is unique
 *     across all of Tally and an email is the password-recovery channel, so
 *     both are an administrator's job — self-service would be an account
 *     takeover route on a shared classroom machine.
 *   - **Anything at all, for a MyLogin account.** The name comes from the
 *     school's MIS and is overwritten on every sign-in (see routes/mylogin.js),
 *     and there is no Tally password to change. Offering the fields would be
 *     offering a change that silently reverts.
 *   - **Anything at all, on the demo account**, which everyone shares.
 */
export default function ProfileEditor() {
  const { user, fetchWithAuth, updateStoredUser, changePassword } = useAuth();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const provider = user?.authProvider || 'local';

  if (provider === 'mylogin') {
    return (
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.secondary', mb: 1 }}>
          Your account
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your name and password come from your school sign-in, so they are changed there rather
          than here. Anything changed in Tally would be replaced next time you sign in.
        </Typography>
      </Box>
    );
  }

  if (provider === 'demo') {
    return null;
  }

  const resetPasswordFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    setError(null);
    setSuccess(null);

    if (!trimmed) {
      setError('Your name cannot be empty');
      return;
    }
    if (trimmed === user?.name) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const response = await fetchWithAuth(`${API_URL}/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save your name');

      updateStoredUser({ name: data.user?.name || trimmed });
      setEditingName(false);
      setSuccess('Your name has been updated.');
    } catch (err) {
      setError(err.message || 'Could not save your name');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword) {
      setError('Enter your current password and a new one');
      return;
    }
    const problem = passwordProblem(newPassword);
    if (problem) {
      setError(`Your new password needs to be longer or stronger. ${problem}.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current one');
      return;
    }

    setSavingPassword(true);
    try {
      const data = await changePassword(currentPassword, newPassword);
      resetPasswordFields();
      setChangingPassword(false);
      setSuccess(
        data?.reauthRequired
          ? 'Password changed. Please sign in again with your new password.'
          : 'Password changed. You are still signed in here, but signed out on any other device.'
      );
    } catch (err) {
      setError(err.message || 'Could not change your password');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.secondary', mb: 1 }}>
        Your account
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {editingName ? (
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            label="Your name"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            disabled={savingName}
            autoFocus
          />
          <Button
            size="small"
            variant="contained"
            onClick={handleSaveName}
            disabled={savingName}
            sx={{ borderRadius: '10px', mt: 0.25, flexShrink: 0 }}
          >
            {savingName ? <CircularProgress size={18} /> : 'Save'}
          </Button>
          <Button
            size="small"
            onClick={() => {
              setNameValue(user?.name || '');
              setEditingName(false);
              setError(null);
            }}
            disabled={savingName}
            sx={{ mt: 0.25, flexShrink: 0 }}
          >
            Cancel
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditOutlinedIcon />}
            onClick={() => {
              setNameValue(user?.name || '');
              setEditingName(true);
              setSuccess(null);
            }}
            sx={{ borderRadius: '10px' }}
          >
            Change your name
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<LockOutlinedIcon />}
            onClick={() => {
              setChangingPassword((open) => !open);
              setSuccess(null);
              setError(null);
              resetPasswordFields();
            }}
            sx={{ borderRadius: '10px' }}
          >
            {changingPassword ? 'Cancel' : 'Change your password'}
          </Button>
        </Stack>
      )}

      <Collapse in={changingPassword} unmountOnExit>
        <Stack spacing={1.5} sx={{ mb: 1 }}>
          <TextField
            size="small"
            fullWidth
            type="password"
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={savingPassword}
          />
          <TextField
            size="small"
            fullWidth
            type="password"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={savingPassword}
            helperText="At least 8 characters, with a capital letter, a small letter and a number"
          />
          <TextField
            size="small"
            fullWidth
            type="password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={savingPassword}
          />
          <Typography variant="caption" color="text.secondary">
            Changing your password signs you out everywhere else. You stay signed in here.
          </Typography>
          <Box>
            <Button
              variant="contained"
              size="small"
              onClick={handleChangePassword}
              disabled={savingPassword}
              startIcon={savingPassword ? <CircularProgress size={16} /> : null}
              sx={{ borderRadius: '10px' }}
            >
              {savingPassword ? 'Saving…' : 'Save new password'}
            </Button>
          </Box>
        </Stack>
      </Collapse>
    </Box>
  );
}
