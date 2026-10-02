/**
 * Root-level Sequelize config entry point.
 *
 * The real implementation lives at src/config/sequelizeConfig.ts so it is inside
 * the TypeScript `rootDir`. This file re-exports it so `sequelize.config.ts`
 * remains resolvable from the repository root for any tooling that expects it
 * there (e.g. a CLI pointed at the root config path).
 */
export { buildConfig, default } from './src/config/sequelizeConfig';
export type { DatabaseConfig } from './src/config/sequelizeConfig';