import { Router } from 'express';
import { z } from 'zod';
import { envelope } from '../../lib/envelope.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import * as auth from './auth.service.js';

export const authRouter = Router();

authRouter.post('/auth/register', authRateLimiter, validateBody(auth.registerSchema), async (req, res) => {
  res.status(201).json(envelope(await auth.register(req.body)));
});

authRouter.post('/auth/login', authRateLimiter, validateBody(auth.loginSchema), async (req, res) => {
  res.json(envelope(await auth.login(req.body)));
});

authRouter.post(
  '/auth/refresh',
  authRateLimiter,
  validateBody(z.object({ refreshToken: z.string().min(1) })),
  async (req, res) => {
    res.json(envelope(await auth.refresh(req.body.refreshToken)));
  },
);

const emailBody = validateBody(z.object({ email: z.string().trim().email('E-mail inválido.') }));
const GENERIC = 'Se houver uma conta com este e-mail, enviamos as instruções.';

authRouter.post('/auth/forgot-password', authRateLimiter, emailBody, async (req, res) => {
  await auth.forgotPassword(req.body.email);
  res.json(envelope({ message: GENERIC }));
});

authRouter.post(
  '/auth/reset-password',
  authRateLimiter,
  validateBody(z.object({ token: z.string().min(10), newPassword: auth.passwordSchema })),
  async (req, res) => {
    await auth.resetPassword(req.body.token, req.body.newPassword);
    res.json(envelope({ message: 'Senha redefinida.' }));
  },
);

authRouter.post('/auth/verify-email/resend', authRateLimiter, emailBody, async (req, res) => {
  await auth.resendVerification(req.body.email);
  res.json(envelope({ message: GENERIC }));
});

authRouter.post(
  '/auth/verify-email/confirm',
  authRateLimiter,
  validateBody(z.object({ token: z.string().min(10) })),
  async (req, res) => {
    await auth.confirmEmail(req.body.token);
    res.json(envelope({ message: 'E-mail confirmado.' }));
  },
);

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(envelope(await auth.me(userId(req))));
});

authRouter.put('/me/profile', requireAuth, validateBody(auth.updateProfileSchema), async (req, res) => {
  res.json(envelope(await auth.updateProfile(userId(req), req.body)));
});

authRouter.put('/me/password', requireAuth, authRateLimiter, validateBody(auth.changePasswordSchema), async (req, res) => {
  await auth.changePassword(userId(req), req.body);
  res.status(204).send();
});

authRouter.post('/me/delete', requireAuth, authRateLimiter, validateBody(auth.deleteAccountSchema), async (req, res) => {
  await auth.deleteAccount(userId(req), req.body.password);
  res.status(204).send();
});
