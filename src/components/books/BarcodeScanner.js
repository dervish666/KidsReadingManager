import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography
} from '@mui/material';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'barcode-scanner-viewfinder';

const BarcodeScanner = ({ open, onScan, onClose }) => {
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);
  const hasScannedRef = useRef(false);

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
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    hasScannedRef.current = false;

    const startScanner = async () => {
      try {
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
              advanced: [{ playsinline: true }]
            }
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
      } catch (err) {
        const errStr = err.toString();
        if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
          setError('Camera permission denied. Please allow camera access in your browser settings and try again.');
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
        <Box
          id={SCANNER_ELEMENT_ID}
          sx={{
            minHeight: 300,
            backgroundColor: '#1a1a1a',
            borderRadius: 1,
            overflow: 'hidden'
          }}
        />
        {error ? (
          <Typography variant="body2" color="error" sx={{ mt: 2, textAlign: 'center' }}>
            {error}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
            Point your camera at the book's ISBN barcode
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
