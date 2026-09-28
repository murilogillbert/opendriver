/** Erro de negócio com status HTTP e (opcional) um código estável que o app
 * usa para escolher a ação de recuperação (UX11). A mensagem é sempre em
 * linguagem simples — nunca "HTTP 402". */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
