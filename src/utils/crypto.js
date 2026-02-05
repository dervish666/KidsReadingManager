/**
 * Cryptographic utilities for authentication
 * All functions use Web Crypto API for Cloudflare Workers compatibility
 */

// ============================================================================
// Password Hashing (PBKDF2)
// ============================================================================

// Cloudflare Workers Web Crypto API has a maximum of 100,000 iterations for PBKDF2
// This is a platform limitation. While OWASP recommends higher, 100k provides
// reasonable protection and is the maximum supported by the runtime.
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;  // 128 bits
const HASH_LENGTH = 32;  // 256 bits

/**
 * Hash a password using PBKDF2 with a random salt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password in format: base64(salt):base64(hash)
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_LENGTH * 8 // bits
  );

  // Store as: base64(salt):base64(hash)
  const saltBase64 = arrayBufferToBase64(salt);
  const hashBase64 = arrayBufferToBase64(new Uint8Array(hash));

  return `${saltBase64}:${hashBase64}`;
}

/**
 * Verify a password against a stored hash with a specific iteration count
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored hash in format: base64(salt):base64(hash)
 * @param {number} iterations - PBKDF2 iteration count
 * @returns {Promise<boolean>} - True if password matches
 */
async function verifyPasswordWithIterations(password, storedHash, iterations) {
  const [saltBase64, hashBase64] = storedHash.split(':');
  if (!saltBase64 || !hashBase64) return false;

  const salt = base64ToArrayBuffer(saltBase64);
  const storedHashBytes = base64ToArrayBuffer(hashBase64);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const computedHash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_LENGTH * 8
  );

  // Constant-time comparison to prevent timing attacks
  return constantTimeEqual(new Uint8Array(computedHash), storedHashBytes);
}

/**
 * Verify a password against a stored hash
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored hash in format: base64(salt):base64(hash)
 * @returns {Promise<{valid: boolean, needsRehash: boolean}>} - Result object for API consistency
 */
export async function verifyPassword(password, storedHash) {
  try {
    const isValid = await verifyPasswordWithIterations(password, storedHash, PBKDF2_ITERATIONS);
    return { valid: isValid, needsRehash: false };
  } catch (error) {
    console.error('Password verification error:', error);
    return { valid: false, needsRehash: false };
  }
}

// ============================================================================
// JWT Implementation (using Web Crypto API)
// ============================================================================

const JWT_ALGORITHM = 'HS256';
// SECURITY: Short-lived access tokens reduce the window of opportunity for stolen tokens
// Access tokens: 15 minutes - requires frequent refresh but limits exposure
// Refresh tokens: 7 days - allows reasonable session persistence
const ACCESS_TOKEN_TTL = 15 * 60 * 1000; // 15 minutes in ms
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

/**
 * Create a JWT access token
 * @param {Object} payload - Token payload (user data)
 * @param {string} secret - JWT secret key
 * @param {number} expiresIn - Expiration time in ms (default: 24 hours)
 * @returns {Promise<string>} - JWT token string
 */
export async function createAccessToken(payload, secret, expiresIn = ACCESS_TOKEN_TTL) {
  const header = {
    alg: JWT_ALGORITHM,
    typ: 'JWT'
  };

  const now = Date.now();
  const tokenPayload = {
    ...payload,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + expiresIn) / 1000)
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await signHS256(signatureInput, secret);
  const encodedSignature = base64UrlEncode(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Create a refresh token
 * @param {string} userId - User ID
 * @param {string} secret - JWT secret key
 * @returns {Promise<{token: string, hash: string, expiresAt: string}>}
 */
export async function createRefreshToken(userId, secret) {
  // Generate a random token
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = arrayBufferToBase64Url(tokenBytes);

  // Hash the token for storage (we store hash, client gets plain token)
  const tokenHash = await hashToken(token);

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL).toISOString();

  return {
    token,
    hash: tokenHash,
    expiresAt
  };
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token string
 * @param {string} secret - JWT secret key
 * @returns {Promise<{valid: boolean, payload?: Object, error?: string}>}
 */
export async function verifyAccessToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    // Verify signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = await signHS256(signatureInput, secret);
    const expectedEncodedSignature = base64UrlEncode(expectedSignature);

    const sigBytes = new Uint8Array([...atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'))].map(c => c.charCodeAt(0)));
    const expectedSigBytes = new Uint8Array([...atob(expectedEncodedSignature.replace(/-/g, '+').replace(/_/g, '/'))].map(c => c.charCodeAt(0)));
    if (!constantTimeEqual(sigBytes, expectedSigBytes)) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    console.error('Token verification error:', error);
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Verify a refresh token against its stored hash
 * @param {string} token - Plain refresh token from client
 * @param {string} storedHash - Stored hash from database
 * @returns {Promise<boolean>}
 */
export async function verifyRefreshToken(token, storedHash) {
  const computedHash = await hashToken(token);
  return computedHash === storedHash;
}

/**
 * Hash a token for storage
 * @param {string} token - Token to hash
 * @returns {Promise<string>} - SHA-256 hash as hex string
 */
export async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToHex(new Uint8Array(hashBuffer));
}

// ============================================================================
// JWT Payload Types
// ============================================================================

/**
 * @typedef {Object} JWTPayload
 * @property {string} sub - User ID
 * @property {string} email - User email
 * @property {string} name - User name
 * @property {string} org - Organization ID
 * @property {string} orgSlug - Organization slug
 * @property {string} role - User role ('owner', 'admin', 'teacher', 'readonly')
 * @property {number} iat - Issued at timestamp
 * @property {number} exp - Expiration timestamp
 */

/**
 * Create JWT payload from user and organization data
 * @param {Object} user - User object from database
 * @param {Object} organization - Organization object from database
 * @returns {Object} - JWT payload
 */
export function createJWTPayload(user, organization) {
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    org: organization.id,
    orgSlug: organization.slug,
    role: user.role
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sign data using HMAC-SHA256
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {Promise<ArrayBuffer>} - Signature
 */
async function signHS256(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

/**
 * Constant-time comparison of two byte arrays
 * @param {Uint8Array} a - First array
 * @param {Uint8Array} b - Second array
 * @returns {boolean} - True if equal
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Convert ArrayBuffer to base64 string
 * @param {Uint8Array} buffer - Buffer to convert
 * @returns {string} - Base64 string
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 * @param {string} base64 - Base64 string
 * @returns {Uint8Array} - Byte array
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert ArrayBuffer to base64url string (URL-safe base64)
 * @param {Uint8Array} buffer - Buffer to convert
 * @returns {string} - Base64url string
 */
function arrayBufferToBase64Url(buffer) {
  return arrayBufferToBase64(buffer)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64url encode a string
 * @param {string|Uint8Array} input - String or bytes to encode
 * @returns {string} - Base64url encoded string
 */
function base64UrlEncode(input) {
  let str;
  if (typeof input === 'string') {
    str = btoa(unescape(encodeURIComponent(input)));
  } else {
    str = arrayBufferToBase64(input);
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode a string
 * @param {string} input - Base64url encoded string
 * @returns {string} - Decoded string
 */
function base64UrlDecode(input) {
  // Add padding if needed
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return decodeURIComponent(escape(atob(base64)));
}

/**
 * Convert ArrayBuffer to hex string
 * @param {Uint8Array} buffer - Buffer to convert
 * @returns {string} - Hex string
 */
function arrayBufferToHex(buffer) {
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// Role Permissions
// ============================================================================

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  READONLY: 'readonly'
};

export const ROLE_HIERARCHY = {
  [ROLES.OWNER]: 4,
  [ROLES.ADMIN]: 3,
  [ROLES.TEACHER]: 2,
  [ROLES.READONLY]: 1
};

/**
 * Check if a role has at least the required permission level
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean} - True if user has sufficient permissions
 */
export function hasPermission(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Permission checks for specific actions
 */
export const permissions = {
  canManageUsers: (role) => hasPermission(role, ROLES.ADMIN),
  canManageOrganization: (role) => hasPermission(role, ROLES.OWNER),
  canManageClasses: (role) => hasPermission(role, ROLES.ADMIN),
  canManageStudents: (role) => hasPermission(role, ROLES.TEACHER),
  canRecordSessions: (role) => hasPermission(role, ROLES.TEACHER),
  canViewData: (role) => hasPermission(role, ROLES.READONLY),
  canManageBooks: (role) => hasPermission(role, ROLES.ADMIN),
  canManageSettings: (role) => hasPermission(role, ROLES.ADMIN)
};

// ============================================================================
// Symmetric Encryption (AES-GCM) for Sensitive Data
// ============================================================================

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const ENCRYPTION_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM

/**
 * Derive an encryption key from the JWT secret
 * Uses HKDF to derive a separate key for encryption
 * @param {string} secret - The JWT secret
 * @returns {Promise<CryptoKey>} - AES-GCM key
 */
async function deriveEncryptionKey(secret) {
  const encoder = new TextEncoder();

  // Import the secret as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey']
  );

  // Derive an AES key using HKDF
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('krm-api-key-encryption-v1'),
      info: encoder.encode('api-key-encryption')
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: ENCRYPTION_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt sensitive data (like API keys)
 * @param {string} plaintext - Data to encrypt
 * @param {string} secret - JWT secret (used to derive encryption key)
 * @returns {Promise<string>} - Encrypted data as base64 string (iv:ciphertext)
 */
export async function encryptSensitiveData(plaintext, secret) {
  if (!plaintext || !secret) {
    throw new Error('Plaintext and secret are required for encryption');
  }

  const encoder = new TextEncoder();
  const key = await deriveEncryptionKey(secret);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Encrypt the data
  const ciphertext = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );

  // Combine IV and ciphertext, encode as base64
  const ivBase64 = arrayBufferToBase64(iv);
  const ciphertextBase64 = arrayBufferToBase64(new Uint8Array(ciphertext));

  return `${ivBase64}:${ciphertextBase64}`;
}

/**
 * Decrypt sensitive data (like API keys)
 * @param {string} encryptedData - Encrypted data from encryptSensitiveData
 * @param {string} secret - JWT secret (used to derive encryption key)
 * @returns {Promise<string>} - Decrypted plaintext
 */
export async function decryptSensitiveData(encryptedData, secret) {
  if (!encryptedData || !secret) {
    throw new Error('Encrypted data and secret are required for decryption');
  }

  // Check if data is in encrypted format (contains :)
  if (!encryptedData.includes(':')) {
    // Data is not encrypted (legacy plaintext), return as-is
    // This allows backward compatibility during migration
    return encryptedData;
  }

  const [ivBase64, ciphertextBase64] = encryptedData.split(':');
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Invalid encrypted data format');
  }

  const key = await deriveEncryptionKey(secret);
  const iv = base64ToArrayBuffer(ivBase64);
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);

  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
