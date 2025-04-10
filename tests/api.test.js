import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { unstable_dev } from 'wrangler';

describe('Kids Reading Manager API', () => {
  let worker;

  // Mock KV namespace
  const mockKV = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  // Setup worker
  beforeAll(async () => {
    // Mock environment bindings
    vi.stubGlobal('READING_MANAGER_KV', mockKV);
    
    worker = await unstable_dev('src/index.js', {
      experimental: { disableExperimentalWarning: true },
    });
  });

  afterAll(async () => {
    if (worker) {
      await worker.stop();
    }
  });

  // Test health check endpoint
  it('should return a health check response', async () => {
    const resp = await worker.fetch('/');
    expect(resp.status).toBe(200);
    
    const data = await resp.json();
    expect(data.status).toBe('ok');
    expect(data.message).toBe('Kids Reading Manager API is running');
  });

  // Test students endpoints
  describe('Students API', () => {
    beforeAll(() => {
      // Mock KV data for students
      mockKV.get.mockImplementation(async (key, options) => {
        if (key === 'app_data' && options?.type === 'json') {
          return {
            students: [
              {
                id: 'test-id-1',
                name: 'Test Student 1',
                lastReadDate: '2025-04-01',
                readingSessions: []
              }
            ],
            settings: {
              readingStatusSettings: {
                recentlyReadDays: 7,
                needsAttentionDays: 14
              }
            }
          };
        }
        return null;
      });
      
      mockKV.put.mockResolvedValue(undefined);
    });

    it('should get all students', async () => {
      const resp = await worker.fetch('/api/students');
      expect(resp.status).toBe(200);
      
      const students = await resp.json();
      expect(Array.isArray(students)).toBe(true);
      expect(students.length).toBe(1);
      expect(students[0].name).toBe('Test Student 1');
    });

    it('should add a new student', async () => {
      const resp = await worker.fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Student',
          lastReadDate: null,
          readingSessions: []
        })
      });
      
      expect(resp.status).toBe(201);
      
      const student = await resp.json();
      expect(student.name).toBe('New Student');
      expect(student.id).toBeDefined();
    });
  });

  // Test settings endpoints
  describe('Settings API', () => {
    it('should get settings', async () => {
      const resp = await worker.fetch('/api/settings');
      expect(resp.status).toBe(200);
      
      const settings = await resp.json();
      expect(settings.readingStatusSettings).toBeDefined();
      expect(settings.readingStatusSettings.recentlyReadDays).toBe(7);
      expect(settings.readingStatusSettings.needsAttentionDays).toBe(14);
    });

    it('should update settings', async () => {
      const resp = await worker.fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          readingStatusSettings: {
            recentlyReadDays: 10,
            needsAttentionDays: 20
          }
        })
      });
      
      expect(resp.status).toBe(200);
      
      const settings = await resp.json();
      expect(settings.readingStatusSettings.recentlyReadDays).toBe(10);
      expect(settings.readingStatusSettings.needsAttentionDays).toBe(20);
    });
  });

  // Test data import/export endpoints
  describe('Data API', () => {
    it('should export all data', async () => {
      const resp = await worker.fetch('/api/data');
      expect(resp.status).toBe(200);
      
      const data = await resp.json();
      expect(data.students).toBeDefined();
      expect(data.settings).toBeDefined();
      expect(data.exportDate).toBeDefined();
    });

    it('should import data', async () => {
      const resp = await worker.fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: [
            {
              id: 'import-id-1',
              name: 'Imported Student',
              lastReadDate: null,
              readingSessions: []
            }
          ],
          settings: {
            readingStatusSettings: {
              recentlyReadDays: 5,
              needsAttentionDays: 10
            }
          }
        })
      });
      
      expect(resp.status).toBe(200);
      
      const result = await resp.json();
      expect(result.message).toBe('Data imported successfully');
      expect(result.count).toBe(1);
    });
  });
});