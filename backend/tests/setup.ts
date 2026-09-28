// Ambiente de teste: banco local com as migrations do hub + do OpenDriver
// (ver README do backend). JWT_SECRET igual ao do hub local para validar RF11.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://postgres@127.0.0.1:55432/hub?schema=opendriver';
process.env.JWT_SECRET ??= 'local-validation-secret-only-for-tests-0123456789abcdef';
process.env.RATE_LIMIT_AUTH_PERMIT ??= '10000';
process.env.PAYMENT_PROVIDER ??= 'mock';
process.env.PAYMENT_WEBHOOK_REQUIRE_TOKEN ??= 'false';
process.env.DISPATCH_OFFER_TIMEOUT_SECONDS ??= '2';
