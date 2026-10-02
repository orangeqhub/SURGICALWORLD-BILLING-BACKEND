import { createApp } from './app';
import { env } from './config/env';
import { sequelize, assertDatabaseConnection } from './config/database';
import { defineModels } from './models';
import { logError, logInfo } from './config/logger';

async function bootstrap(): Promise<void> {
  // Bind models before serving so associations are available to every request.
  defineModels(sequelize);

  await assertDatabaseConnection();
  logInfo(`Database connected: ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT}`);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logInfo(`Surgical World Billing API listening on http://localhost:${env.PORT}/api`);
    logInfo(`Environment: ${env.NODE_ENV}`);
  });

  const shutdown = (signal: string) => {
    logInfo(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      void sequelize.close().finally(() => process.exit(0));
    });
    // Do not let a hung connection hold the process open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logError('Unhandled promise rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
  });
  process.on('uncaughtException', (error) => {
    logError('Uncaught exception', { message: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });
}

bootstrap().catch((error: unknown) => {
  logError('Fatal startup error', { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
  process.exit(1);
});