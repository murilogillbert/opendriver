import { assertProductionConfig, config } from './config.js';
import { createServer } from './httpServer.js';
import { startPaymentReconciliation } from './jobs/paymentReconciliation.js';
import { startScheduledRidesSweeper, stopScheduledRidesSweeper } from './jobs/scheduledRides.js';
import { startComplaintAttachmentRetention } from './modules/complaints/complaints.service.js';
import { startRecordingRetention } from './modules/recording/recording.service.js';
import { startStaleDriverSweep, stopStaleDriverSweep } from './jobs/staleDrivers.js';
import { prisma } from './infra/prisma.js';
import { avisarSePagamentoSimulado } from './infra/payments/index.js';
import { startDispatchSweeper, stopDispatchSweeper } from './modules/rides/dispatch.js';
import { closeRealtime } from './realtime/io.js';

async function main(): Promise<void> {
  assertProductionConfig();
  const server = await createServer();
  server.listen(config.port, () => console.log(`OpenDriver API ouvindo na porta ${config.port}`));
  // Depois do `listen` e sem `await`: é diagnóstico, não deve atrasar o serviço a atender.
  void avisarSePagamentoSimulado();
  startDispatchSweeper();
  startPaymentReconciliation();
  startScheduledRidesSweeper();
  startRecordingRetention();
  startComplaintAttachmentRetention();
  startStaleDriverSweep();

  // Deploy/reinício: para de aceitar conexões, fecha sockets e o pool do banco.
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    stopDispatchSweeper();
    stopScheduledRidesSweeper();
    stopStaleDriverSweep();
    setTimeout(() => process.exit(0), 10_000).unref();
    server.close();
    void closeRealtime()
      .catch(() => undefined)
      .then(() => prisma.$disconnect())
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar', err);
  process.exit(1);
});
