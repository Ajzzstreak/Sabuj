import { buildApp } from './app.js';
import { createClaudeAsk } from './ask/claude.js';
import { ConfigError, loadConfig } from './config.js';
import { Store } from './db.js';
import { createClaudeProfiler } from './profile/claude.js';
import { createProviders } from './providers/index.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new Store(config.dbPath, config.maxEventsPerDevice);
  const providers = createProviders(config);
  // Assigned after buildApp so the profiler can log through the app logger.
  let warn: (msg: string, detail?: Record<string, unknown>) => void = (msg) => console.warn(msg);
  const claude = createClaudeProfiler({
    apiKey: config.anthropicApiKey,
    model: config.claudeModel,
    timeoutMs: config.claudeTimeoutMs,
    log: (msg, detail) => warn(msg, detail),
  });

  const claudeAsk = createClaudeAsk({ apiKey: config.anthropicApiKey, model: config.claudeModel, log: (msg, detail) => warn(msg, detail) });

  const { fastify } = await buildApp({ config, store, providers, claude, claudeAsk, logger: { level: config.logLevel } });
  warn = (msg, detail) => fastify.log.warn(detail ?? {}, msg);

  for (const w of config.warnings) fastify.log.warn(w);

  // Graceful shutdown (SIGTERM from `docker stop` / the host, SIGINT from a terminal):
  // stop accepting connections and finish in-flight requests (fastify.close; new
  // requests get 503 meanwhile), clear the background timers and flush pending
  // profile work (the app's onClose hook), then close SQLite. A second signal or
  // SHUTDOWN_TIMEOUT_MS without finishing exits at once.
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) {
      fastify.log.warn({ signal }, 'second signal: exiting now');
      process.exit(1);
    }
    closing = true;
    fastify.log.info({ signal }, 'shutting down');
    const force = setTimeout(() => {
      fastify.log.error({ timeoutMs: config.shutdownTimeoutMs }, 'shutdown timed out: exiting');
      process.exit(1);
    }, config.shutdownTimeoutMs);
    force.unref();
    let code = 0;
    try {
      await fastify.close();
    } catch (err) {
      code = 1;
      fastify.log.error({ err }, 'error while closing');
    } finally {
      store.close();
    }
    fastify.log.info('closed');
    process.exit(code);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(
    {
      providers: providers.map((p) => p.name),
      categories: config.catalogCategories.length ? config.catalogCategories : 'all',
      claude: claude ? config.claudeModel : 'disabled (no ANTHROPIC_API_KEY): heuristic profiler + rules-based ask',
      alertCheckIntervalMs: config.alertCheckIntervalMs || 'disabled',
      push: config.pushProvider,
    },
    'DealLens API ready',
  );
}

main().catch((err) => {
  // A configuration problem is the operator's to fix: print the message, not a stack.
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
