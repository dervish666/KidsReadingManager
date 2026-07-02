import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
} from '@mui/material';
const SCANNER_ELEMENT_ID = 'barcode-scanner-viewfinder';

const BarcodeScanner = ({ open, onScan, onClose }) => {
  const [error, setError] = useState(null);
  const [zoomOn, setZoomOn] = useState(false);
  const scannerRef = useRef(null);
  const hasScannedRef = useRef(false);
  // Hardware zoom capability ({ min, max, step }) if the device/browser exposes
  // it (Android Chrome). null on iOS Safari, which doesn't expose camera zoom —
  // there we fall back to a CSS transform on the <video> for a magnified aim.
  const zoomCapRef = useRef(null);
  const videoElRef = useRef(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // State 2 = SCANNING, 3 = PAUSED
        if (state === 2 || state === 3) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        // Scanner may already be stopped; safe to ignore
      }
      try {
        scannerRef.current.clear();
      } catch (err) {
        // Element may already be cleared; safe to ignore
      }
      scannerRef.current = null;
    }
    zoomCapRef.current = null;
    videoElRef.current = null;
  }, []);

  // Apply (or clear) 2× zoom. Prefers real hardware zoom — which crops the
  // sensor, so the scanned frames are magnified and small barcodes actually
  // decode from further away. Falls back to a CSS scale (aim aid only) where the
  // camera doesn't expose zoom; on those devices the high-resolution stream
  // requested below is what carries detection.
  const applyZoom = useCallback(async (on) => {
    const scanner = scannerRef.current;
    if (scanner && zoomCapRef.current) {
      const { min = 1, max = 2 } = zoomCapRef.current;
      const target = on ? Math.min(2, max) : min;
      try {
        await scanner.applyVideoConstraints({ advanced: [{ zoom: target }] });
        return;
      } catch (err) {
        // Hardware zoom rejected mid-session — fall through to CSS.
      }
    }
    const video = videoElRef.current;
    if (video) {
      video.style.transformOrigin = 'center center';
      video.style.transform = on ? 'scale(2)' : '';
    }
  }, []);

  const toggleZoom = useCallback(() => {
    setZoomOn((prev) => {
      const next = !prev;
      applyZoom(next);
      return next;
    });
  }, [applyZoom]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setZoomOn(false);
    hasScannedRef.current = false;

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 300, height: 150 },
            formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13],
            videoConstraints: {
              facingMode: 'environment',
              // Request a high-resolution stream so a small barcode resolves from
              // a comfortable, in-focus distance (no need to get so close the
              // camera can't focus). The device caps this to what it supports.
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ playsinline: true }],
            },
          },
          (decodedText) => {
            // Prevent duplicate callbacks from rapid successive scans
            if (hasScannedRef.current) return;
            hasScannedRef.current = true;

            stopScanner().then(() => {
              if (onScan) {
                onScan(decodedText);
              }
            });
          },
          () => {
            // Scan failure callback (fires on every frame without a match) — intentionally ignored
          }
        );

        // Detect hardware zoom support + grab the video element for the CSS
        // fallback. Both are best-effort — guarded so a missing API never breaks
        // scanning.
        try {
          const caps = scanner.getRunningTrackCapabilities?.();
          if (caps && caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > 1) {
            zoomCapRef.current = caps.zoom;
          }
        } catch (err) {
          // Capabilities unavailable — CSS fallback still works.
        }
        videoElRef.current =
          document.getElementById(SCANNER_ELEMENT_ID)?.querySelector('video') || null;
      } catch (err) {
        const errStr = err.toString();
        if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
          setError(
            'Camera permission denied. Please allow camera access in your browser settings and try again.'
          );
        } else if (errStr.includes('NotFoundError')) {
          setError('No camera found. Please ensure your device has a camera.');
        } else {
          setError(`Could not start camera: ${err.message || err}`);
        }
      }
    };

    // Small delay to ensure the Dialog DOM element is rendered before html5-qrcode uses it
    const timerId = setTimeout(startScanner, 100);

    return () => {
      clearTimeout(timerId);
      stopScanner();
    };
  }, [open, onScan, stopScanner]);

  const handleClose = () => {
    stopScanner().then(() => {
      if (onClose) {
        onClose();
      }
    });
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Scan ISBN Barcode</DialogTitle>
      <DialogContent>
        <Box sx={{ position: 'relative' }}>
          <Box
            id={SCANNER_ELEMENT_ID}
            sx={{
              minHeight: 300,
              backgroundColor: '#1a1a1a',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          />
          {!error && (
            <Button
              onClick={toggleZoom}
              aria-label={zoomOn ? 'Zoom out to 1x' : 'Zoom in to 2x'}
              sx={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                minWidth: 52,
                height: 44,
                px: 1.5,
                borderRadius: '22px',
                fontWeight: 800,
                fontSize: '0.95rem',
                color: 'white',
                backgroundColor: zoomOn ? 'primary.main' : 'rgba(0, 0, 0, 0.55)',
                backdropFilter: 'blur(2px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                '&:hover': {
                  backgroundColor: zoomOn ? 'primary.dark' : 'rgba(0, 0, 0, 0.7)',
                },
              }}
            >
              {zoomOn ? '2×' : '1×'}
            </Button>
          )}
        </Box>
        {error ? (
          <Typography variant="body2" color="error" sx={{ mt: 2, textAlign: 'center' }}>
            {error}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
            Point your camera at the book&apos;s ISBN barcode. Tap 2× to zoom in for small codes.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;
