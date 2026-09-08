import fs from 'fs';
import configuration from './configuration';

describe('Configuration Loader', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalWorkerId = process.env.JEST_WORKER_ID;

  const validFullConfig = {
    decimals: 12,
    strategy: 'avg',
    rateDifferencePercentThreshold: 25,
    groupPercentage: 60,
    minSources: 1,
    priorities: ['Coinmarketcap', 'Coingecko'],
    rateLifetime: 60,
    base_coins: ['USD', 'BTC', 'ETH'],
    server: {
      port: 36661,
      mongodb: { host: '127.0.0.1', port: 27017, db: 'tickersdb' },
    },
  };

  // A spy on `fs.readFileSync` is process wide, and Jest reads source files through it while it
  // formats console output. Answer only for the configuration files and delegate everything else
  // to the real implementation; otherwise Jest parses the mocked config JSON as a source map and
  // the suite fails inside Jest rather than in the code under test.
  const realReadFileSync = fs.readFileSync;

  const mockConfigFileRead = () =>
    jest
      .spyOn(fs, 'readFileSync')
      .mockImplementation(((path: unknown, ...rest: unknown[]) =>
        typeof path === 'string' && path.endsWith('.jsonc')
          ? JSON.stringify(validFullConfig)
          : (realReadFileSync as (...args: unknown[]) => unknown)(
              path,
              ...rest,
            )) as typeof fs.readFileSync);

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.JEST_WORKER_ID = originalWorkerId;
    jest.restoreAllMocks();
  });

  it('should prioritize config.jsonc over config.default.jsonc in development mode', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JEST_WORKER_ID;

    const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
      if (path === './config.test.jsonc') return false;
      if (path === './config.jsonc') return true;
      if (path === './config.default.jsonc') return true;
      return false;
    });

    const readFileSyncSpy = mockConfigFileRead();

    const config = configuration();
    expect(existsSyncSpy).toHaveBeenCalledWith('./config.jsonc');
    expect(readFileSyncSpy).toHaveBeenCalledWith('./config.jsonc', 'utf-8');
    expect(config.server.port).toBe(36661);

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('should fallback to config.default.jsonc in dev mode if config.jsonc does not exist', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JEST_WORKER_ID;

    const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
      if (path === './config.test.jsonc') return false;
      if (path === './config.jsonc') return false;
      if (path === './config.default.jsonc') return true;
      return false;
    });

    const readFileSyncSpy = mockConfigFileRead();

    const config = configuration();
    expect(existsSyncSpy).toHaveBeenCalledWith('./config.default.jsonc');
    expect(readFileSyncSpy).toHaveBeenCalledWith('./config.default.jsonc', 'utf-8');
    expect(config.server.port).toBe(36661);

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('should terminate process in production if config.jsonc is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JEST_WORKER_ID;

    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => configuration()).toThrow('No configuration file found.');
    expect(exitSpy).toHaveBeenCalledWith(-1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No configuration file found'),
    );

    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
