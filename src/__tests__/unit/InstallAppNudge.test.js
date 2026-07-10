import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';

const setUserAgent = (ua) => {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
};

// The component stashes the beforeinstallprompt event at module level (Chrome
// can fire it before the authed shell mounts), so each test imports a FRESH
// module via resetModules — otherwise tests leak state into each other and
// become order-dependent (audit cycle 16 quality sweep).
const loadInstallAppNudge = async () =>
  (await import('../../components/InstallAppNudge')).default;

describe('InstallAppNudge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete window.navigator.userAgent;
    delete window.navigator.standalone;
    localStorage.clear();
  });

  it('shows Add to Home Screen instructions on iOS Safari', async () => {
    setUserAgent(IPHONE_SAFARI_UA);
    const InstallAppNudge = await loadInstallAppNudge();
    render(<InstallAppNudge />);

    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('dismiss hides the banner and persists across renders', async () => {
    setUserAgent(IPHONE_SAFARI_UA);
    const InstallAppNudge = await loadInstallAppNudge();
    const { unmount } = render(<InstallAppNudge />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install suggestion' }));
    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
    expect(localStorage.getItem('installNudgeDismissed')).toBe('true');

    unmount();
    render(<InstallAppNudge />);
    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
  });

  it('renders nothing in a non-Safari iOS browser (no Add to Home Screen there)', async () => {
    setUserAgent(IPHONE_CHROME_UA);
    const InstallAppNudge = await loadInstallAppNudge();
    const { container } = render(<InstallAppNudge />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when already running from the home screen', async () => {
    setUserAgent(IPHONE_SAFARI_UA);
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    const InstallAppNudge = await loadInstallAppNudge();
    const { container } = render(<InstallAppNudge />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows an Install button when Chromium fires beforeinstallprompt', async () => {
    const InstallAppNudge = await loadInstallAppNudge();
    render(<InstallAppNudge />);
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();

    const promptEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    act(() => {
      window.dispatchEvent(promptEvent);
    });

    const installButton = screen.getByRole('button', { name: 'Install' });
    fireEvent.click(installButton);

    expect(promptEvent.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('is order-independent: a test after the prompt test sees no stashed event', async () => {
    setUserAgent(IPHONE_CHROME_UA);
    const InstallAppNudge = await loadInstallAppNudge();
    const { container } = render(<InstallAppNudge />);
    expect(container).toBeEmptyDOMElement();
  });
});
