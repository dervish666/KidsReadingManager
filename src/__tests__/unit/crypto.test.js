import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  hashToken,
  createJWTPayload,
  hasPermission,
  permissions,
  ROLES,
  ROLE_HIERARCHY
} from '../../utils/crypto.js';

describe('Password Hashing', () => {
  describe('hashPassword', () => {
    it('should hash a password and return salt:hash format', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).toContain(':');
      const [salt, hashPart] = hash.split(':');
      expect(salt).toBeTruthy();
      expect(hashPart).toBeTruthy();
    });

    it('should produce different hashes for same password (random salt)', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');
      expect(hash).toContain(':');
    });

    it('should handle unicode passwords', async () => {
      const hash = await hashPassword('密码测试123');
      expect(hash).toContain(':');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'correctPassword';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correctPassword';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should return false for malformed hash (missing colon)', async () => {
      const isValid = await verifyPassword('password', 'invalidhashformat');
      expect(isValid).toBe(false);
    });

    it('should return false for empty stored hash', async () => {
      const isValid = await verifyPassword('password', '');
      expect(isValid).toBe(false);
    });

    it('should handle empty password verification', async () => {
      const hash = await hashPassword('');
      const isValid = await verifyPassword('', hash);
      expect(isValid).toBe(true);
    });

    it('should be case-sensitive', async () => {
      const hash = await hashPassword('Password');

      const isValid = await verifyPassword('password', hash);
      expect(isValid).toBe(false);
    });
  });
});

describe('JWT Tokens', () => {
  const testSecret = 'test-secret-key-for-jwt';
  const testPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    org: 'org-456',
    orgSlug: 'test-org',
    role: 'teacher'
  };

  describe('createAccessToken', () => {
    it('should create a valid JWT token', async () => {
      const token = await createAccessToken(testPayload, testSecret);

      expect(token).toBeTruthy();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include iat and exp in payload', async () => {
      const token = await createAccessToken(testPayload, testSecret);
      const result = await verifyAccessToken(token, testSecret);

      expect(result.valid).toBe(true);
      expect(result.payload.iat).toBeDefined();
      expect(result.payload.exp).toBeDefined();
      expect(result.payload.exp).toBeGreaterThan(result.payload.iat);
    });

    it('should preserve original payload fields', async () => {
      const token = await createAccessToken(testPayload, testSecret);
      const result = await verifyAccessToken(token, testSecret);

      expect(result.payload.sub).toBe(testPayload.sub);
      expect(result.payload.email).toBe(testPayload.email);
      expect(result.payload.role).toBe(testPayload.role);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid token', async () => {
      const token = await createAccessToken(testPayload, testSecret);
      const result = await verifyAccessToken(token, testSecret);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject token with wrong secret', async () => {
      const token = await createAccessToken(testPayload, testSecret);
      const result = await verifyAccessToken(token, 'wrong-secret');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject malformed token (missing parts)', async () => {
      const result = await verifyAccessToken('invalid.token', testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject expired token', async () => {
      // Create token that expires immediately
      const token = await createAccessToken(testPayload, testSecret, -1000);
      const result = await verifyAccessToken(token, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('should reject token with empty string', async () => {
      const result = await verifyAccessToken('', testSecret);

      expect(result.valid).toBe(false);
    });
  });
});

describe('Refresh Tokens', () => {
  describe('createRefreshToken', () => {
    it('should create token with hash and expiry', async () => {
      const result = await createRefreshToken('user-123', 'secret');

      expect(result.token).toBeTruthy();
      expect(result.hash).toBeTruthy();
      expect(result.expiresAt).toBeTruthy();
    });

    it('should create unique tokens each time', async () => {
      const result1 = await createRefreshToken('user-123', 'secret');
      const result2 = await createRefreshToken('user-123', 'secret');

      expect(result1.token).not.toBe(result2.token);
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should set expiry in the future', async () => {
      const result = await createRefreshToken('user-123', 'secret');
      const expiryDate = new Date(result.expiresAt);

      expect(expiryDate.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify correct token against its hash', async () => {
      const { token, hash } = await createRefreshToken('user-123', 'secret');

      const isValid = await verifyRefreshToken(token, hash);
      expect(isValid).toBe(true);
    });

    it('should reject wrong token against hash', async () => {
      const { hash } = await createRefreshToken('user-123', 'secret');

      const isValid = await verifyRefreshToken('wrong-token', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('hashToken', () => {
    it('should produce consistent hash for same input', async () => {
      const hash1 = await hashToken('test-token');
      const hash2 = await hashToken('test-token');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await hashToken('token-1');
      const hash2 = await hashToken('token-2');

      expect(hash1).not.toBe(hash2);
    });

    it('should return hex string', async () => {
      const hash = await hashToken('test');

      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });
});

describe('createJWTPayload', () => {
  it('should create payload from user and organization', () => {
    const user = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'teacher'
    };
    const organization = {
      id: 'org-456',
      slug: 'test-org'
    };

    const payload = createJWTPayload(user, organization);

    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('test@example.com');
    expect(payload.name).toBe('Test User');
    expect(payload.org).toBe('org-456');
    expect(payload.orgSlug).toBe('test-org');
    expect(payload.role).toBe('teacher');
  });
});

describe('Role Permissions', () => {
  describe('ROLES constant', () => {
    it('should define all role types', () => {
      expect(ROLES.OWNER).toBe('owner');
      expect(ROLES.ADMIN).toBe('admin');
      expect(ROLES.TEACHER).toBe('teacher');
      expect(ROLES.READONLY).toBe('readonly');
    });
  });

  describe('ROLE_HIERARCHY', () => {
    it('should have correct hierarchy levels', () => {
      expect(ROLE_HIERARCHY[ROLES.OWNER]).toBe(4);
      expect(ROLE_HIERARCHY[ROLES.ADMIN]).toBe(3);
      expect(ROLE_HIERARCHY[ROLES.TEACHER]).toBe(2);
      expect(ROLE_HIERARCHY[ROLES.READONLY]).toBe(1);
    });
  });

  describe('hasPermission', () => {
    it('should allow owner to access all roles', () => {
      expect(hasPermission('owner', 'owner')).toBe(true);
      expect(hasPermission('owner', 'admin')).toBe(true);
      expect(hasPermission('owner', 'teacher')).toBe(true);
      expect(hasPermission('owner', 'readonly')).toBe(true);
    });

    it('should allow admin to access admin and below', () => {
      expect(hasPermission('admin', 'owner')).toBe(false);
      expect(hasPermission('admin', 'admin')).toBe(true);
      expect(hasPermission('admin', 'teacher')).toBe(true);
      expect(hasPermission('admin', 'readonly')).toBe(true);
    });

    it('should allow teacher to access teacher and below', () => {
      expect(hasPermission('teacher', 'owner')).toBe(false);
      expect(hasPermission('teacher', 'admin')).toBe(false);
      expect(hasPermission('teacher', 'teacher')).toBe(true);
      expect(hasPermission('teacher', 'readonly')).toBe(true);
    });

    it('should allow readonly to only access readonly', () => {
      expect(hasPermission('readonly', 'owner')).toBe(false);
      expect(hasPermission('readonly', 'admin')).toBe(false);
      expect(hasPermission('readonly', 'teacher')).toBe(false);
      expect(hasPermission('readonly', 'readonly')).toBe(true);
    });

    it('should handle unknown roles safely', () => {
      expect(hasPermission('unknown', 'readonly')).toBe(false);
      expect(hasPermission('teacher', 'unknown')).toBe(true); // 2 >= 0
    });
  });

  describe('permissions object', () => {
    it('canManageUsers requires admin', () => {
      expect(permissions.canManageUsers('owner')).toBe(true);
      expect(permissions.canManageUsers('admin')).toBe(true);
      expect(permissions.canManageUsers('teacher')).toBe(false);
      expect(permissions.canManageUsers('readonly')).toBe(false);
    });

    it('canManageOrganization requires owner', () => {
      expect(permissions.canManageOrganization('owner')).toBe(true);
      expect(permissions.canManageOrganization('admin')).toBe(false);
      expect(permissions.canManageOrganization('teacher')).toBe(false);
    });

    it('canManageStudents requires teacher', () => {
      expect(permissions.canManageStudents('owner')).toBe(true);
      expect(permissions.canManageStudents('admin')).toBe(true);
      expect(permissions.canManageStudents('teacher')).toBe(true);
      expect(permissions.canManageStudents('readonly')).toBe(false);
    });

    it('canViewData requires readonly', () => {
      expect(permissions.canViewData('owner')).toBe(true);
      expect(permissions.canViewData('admin')).toBe(true);
      expect(permissions.canViewData('teacher')).toBe(true);
      expect(permissions.canViewData('readonly')).toBe(true);
    });

    it('canManageBooks requires admin', () => {
      expect(permissions.canManageBooks('owner')).toBe(true);
      expect(permissions.canManageBooks('admin')).toBe(true);
      expect(permissions.canManageBooks('teacher')).toBe(false);
    });

    it('canRecordSessions requires teacher', () => {
      expect(permissions.canRecordSessions('owner')).toBe(true);
      expect(permissions.canRecordSessions('admin')).toBe(true);
      expect(permissions.canRecordSessions('teacher')).toBe(true);
      expect(permissions.canRecordSessions('readonly')).toBe(false);
    });
  });
});
