import '@testing-library/jest-dom';

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

// Mock IntersectionObserver for BookCover tests (happy-dom has it but doesn't fire callbacks)
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor(callback) {
    this._callback = callback;
  }
  observe() {
    // Immediately fire with isIntersecting: true so covers load in tests
    this._callback([{ isIntersecting: true }]);
  }
  disconnect() {}
  unobserve() {}
};
