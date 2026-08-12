import app from './app';
import { config } from './config/env';

const server = app.listen(config.port, () => {
  console.log(`==================================================`);
  console.log(`EngCode API Server running in [${config.env}] mode`);
  console.log(`URL: http://localhost:${config.port}${config.apiPrefix}`);
  console.log(`Health Check: http://localhost:${config.port}${config.apiPrefix}/health`);
  console.log(`==================================================`);
});

// Handle uncaught errors gracefully
process.on('unhandledRejection', (reason: Error) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

export default server;
