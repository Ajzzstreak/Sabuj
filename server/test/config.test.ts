import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const prod = { NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com', DB_PATH: '/data/deallens.db' };

describe('loadConfig', () => {
  it('development: every setting has a default, no production rules', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({ production: false, warnings: [], corsOrigin: '*', trustProxy: false, logLevel: 'info', shutdownTimeoutMs: 10000 });
  });

  it('invalid values fail with a readable message naming the variable (any environment)', () => {
    for (const env of [{ PORT: 'eighty' }, { PORT: '70000' }, { TRUST_PROXY: 'yes' }, { LOG_LEVEL: 'loud' }, { MOCK_CATALOG: 'toys' }]) {
      const name = Object.keys(env)[0]!;
      let err: unknown;
      try {
        loadConfig(env);
      } catch (e) {
        err = e;
      }
      expect(err, name).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toMatch(new RegExp(`Invalid configuration:\\n  - ${name}: `));
    }
    // Secrets are never echoed back.
    expect(() => loadConfig({ PORT: 'x', ANTHROPIC_API_KEY: 'sk-secret' })).toThrow(/PORT: .*\(got "x"\)/);
  });

  it('TRUST_PROXY accepts false / true / hop counts', () => {
    expect(loadConfig({ TRUST_PROXY: '' }).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: '0' }).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(1);
    expect(loadConfig({ TRUST_PROXY: ' 2 ' }).trustProxy).toBe(2);
  });

  it('production: CORS_ORIGIN must be set explicitly and be origins', () => {
    expect(() => loadConfig({ ...prod, CORS_ORIGIN: undefined })).toThrow(/CORS_ORIGIN must be set explicitly in production/);
    expect(() => loadConfig({ ...prod, CORS_ORIGIN: '  ' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...prod, CORS_ORIGIN: 'https://app.example.com/' })).toThrow(/not an origin.*app\.example\.com\//);
    expect(() => loadConfig({ ...prod, CORS_ORIGIN: 'app.example.com' })).toThrow(/not an origin/);
    expect(loadConfig({ ...prod, CORS_ORIGIN: 'https://app.example.com, http://localhost:8081' }).corsOrigin).toBe('https://app.example.com, http://localhost:8081');
    const star = loadConfig({ ...prod, CORS_ORIGIN: '*' });
    expect(star.warnings.some((w) => /CORS_ORIGIN="\*"/.test(w))).toBe(true);
  });

  it('production: refuses an in-memory database, warns about proxy, mock data and overrides', () => {
    expect(() => loadConfig({ ...prod, DB_PATH: ':memory:' })).toThrow(/DB_PATH=:memory:/);
    const c = loadConfig({ ...prod, MOCK_PRICE_OVERRIDES: 'a:walmart=1' });
    expect(c.production).toBe(true);
    expect(c.warnings.join('\n')).toMatch(/TRUST_PROXY is not set/);
    expect(c.warnings.join('\n')).toMatch(/"mock"/);
    expect(c.warnings.join('\n')).toMatch(/MOCK_PRICE_OVERRIDES/);
    expect(loadConfig({ ...prod, TRUST_PROXY: '1', PRICE_PROVIDERS: 'kroger' }).warnings).toEqual([]);
  });

  it('all problems are reported at once', () => {
    try {
      loadConfig({ NODE_ENV: 'production', DB_PATH: ':memory:' });
      expect.unreachable();
    } catch (e) {
      expect((e as ConfigError).problems).toHaveLength(2);
    }
  });
});
