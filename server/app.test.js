// @vitest-environment node
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns an OK status for health checks', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not log database error messages that may contain sensitive data', async () => {
    const failure = Object.assign(new Error('synthetic-secret-must-not-be-logged'), { code: 'XX001' });
    const failingApp = createApp({
      pool: {
        query: async () => {
          throw failure;
        },
      },
    });
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(failingApp).get('/api/auth/state').expect(500);

    expect(response.body).toEqual({ error: 'Ocorreu um erro. Tente novamente.' });
    expect(logger).toHaveBeenCalledWith('API request failed (XX001)');
    expect(logger.mock.calls.flat().join(' ')).not.toContain('synthetic-secret-must-not-be-logged');
    logger.mockRestore();
  });
});
