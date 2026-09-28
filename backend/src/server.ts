import { assertProductionConfig, config } from './config.js';
import { createServer } from './httpServer.js';
import { startPaymentReconciliation } from './jobs/paymentReconciliation.js';
import { startRecordingRetention } from './modules/recording/recording.service.js';
import { startDispatchSweeper } from './modules/rides/dispatch.js';

async function main(): Promise<void> {
  assertProductionConfig();
  const server = await createServer();
  server.listen(config.port, () => console.log(`OpenDriver API ouvindo na porta ${config.port}`));
  startDispatchSweeper();
  startPaymentReconciliation();
  startRecordingRetention();

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar', err);
  process.exit(1);
});
