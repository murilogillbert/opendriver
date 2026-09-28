import { assertProductionConfig, config } from './config.js';
import { createServer } from './httpServer.js';

async function main(): Promise<void> {
  assertProductionConfig();
  const server = await createServer();
  server.listen(config.port, () => console.log(`OpenDriver API ouvindo na porta ${config.port}`));
}

main().catch((err) => {
  console.error('Falha ao iniciar', err);
  process.exit(1);
});
