import { buildApp } from './app.js';
import { createClaudeAsk } from './ask/claude.js';
import { loadConfig } from './config.js';
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

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    fastify.log.info({ signal }, 'shutting down');
    try {
      await fastify.close(); // flushes pending profile work
    } finally {
      store.close();
    }
    process.exit(0);
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
  console.error(err);
  process.exit(1);
});
