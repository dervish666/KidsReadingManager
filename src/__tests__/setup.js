import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Web Crypto API for Node.js environment
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  const crypto = await import('crypto');
  globalThis.crypto = crypto.webcrypto;
}

// Mock btoa/atob if not available
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

// Mock TextEncoder/TextDecoder if needed
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
