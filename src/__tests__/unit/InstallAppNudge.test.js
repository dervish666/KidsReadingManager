import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import InstallAppNudge from '../../components/InstallAppNudge';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';

const setUserAgent = (ua) => {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
};

describe('InstallAppNudge', () => {
  afterEach(() => {
    delete window.navigator.userAgent;
    delete window.navigator.standalone;
    localStorage.clear();
  });

  it('shows Add to Home Screen instructions on iOS Safari', () => {
    setUserAgent(IPHONE_SAFARI_UA);
    render(<InstallAppNudge />);

    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('dismiss hides the banner and persists across renders', () => {
    setUserAgent(IPHONE_SAFARI_UA);
    const { unmount } = render(<InstallAppNudge />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install suggestion' }));
    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
    expect(localStorage.getItem('installNudgeDismissed')).toBe('true');

    unmount();
    render(<InstallAppNudge />);
    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
  });

  it('renders nothing in a non-Safari iOS browser (no Add to Home Screen there)', () => {
    setUserAgent(IPHONE_CHROME_UA);
    const { container } = render(<InstallAppNudge />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when already running from the home screen', () => {
    setUserAgent(IPHONE_SAFARI_UA);
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    const { container } = render(<InstallAppNudge />);

    expect(container).toBeEmptyDOMElement();
  });

  // Keep this test last: the beforeinstallprompt event it dispatches is stashed
  // at module level, so later renders in this file would see an Install button.
  it('shows an Install button when Chromium fires beforeinstallprompt', () => {
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
});
