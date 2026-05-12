import { FormEvent, useState } from "react";

import { marketplaceApi } from "../../lib/marketplaceApi";
import { Button, Card, Chip, Icon, Input } from "../ui";
import { useToast } from "../../lib/useToast";

function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const navigateHome = () => {
    window.history.pushState(null, "", "/minha-conta");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await marketplaceApi.login(String(values.email), String(values.senha));
      toast.success("Bem-vindo de volta!");
      navigateHome();
    } catch {
      setError("Email ou senha inválidos.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await marketplaceApi.register(values);
      toast.success("Conta criada com sucesso!");
      navigateHome();
    } catch {
      setError("Não foi possível criar a conta. Verifique os dados.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface px-margin-mobile py-12 text-on-surface dark:bg-dark-bg dark:text-dark-text lg:px-margin-desktop">
      <button
        type="button"
        onClick={() => {
          window.history.pushState(null, "", "/");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        className="mx-auto mb-6 flex max-w-5xl items-center gap-2 text-label-bold text-on-surface-variant transition hover:text-on-surface dark:text-dark-textMuted dark:hover:text-dark-text"
      >
        <Icon name="arrow_back" size={18} /> Voltar para a home
      </button>

      <Card surface="bright" rounded="3xl" padding="none" tactile className="mx-auto max-w-5xl overflow-hidden">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="relative isolate overflow-hidden bg-inverse-surface p-8 text-inverse-on-surface lg:p-10">
            <div className="pointer-events-none absolute -left-12 top-1/3 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
            <Chip tone="ghost" uppercase className="border-white/15 text-accent-soft">
              Minha conta DriverHub
            </Chip>
            <h1 className="mt-6 font-display text-headline-lg leading-tight text-white">
              Acompanhe vouchers, cashback e economia acumulada.
            </h1>
            <p className="mt-4 text-body-md text-white/70">
              Cadastre-se uma vez, confirme endereço e receba produtos digitais por e-mail ou
              físicos no endereço cadastrado.
            </p>
            <ul className="mt-8 space-y-3 text-body-sm text-white/80">
              <li className="flex items-center gap-2">
                <Icon name="check_circle" size={18} className="text-accent-soft" /> Cashback creditado em até 24 h após confirmação
              </li>
              <li className="flex items-center gap-2">
                <Icon name="check_circle" size={18} className="text-accent-soft" /> Pagamento por Pix com QR pronto na hora
              </li>
              <li className="flex items-center gap-2">
                <Icon name="check_circle" size={18} className="text-accent-soft" /> Atendimento direto pelo WhatsApp se precisar
              </li>
            </ul>
          </aside>

          <div className="p-6 sm:p-10">
            <div className="mb-6 inline-flex rounded-pill border border-outline-variant bg-surface-container p-1 dark:border-dark-outline dark:bg-dark-surfaceElevated">
              <button
                type="button"
                onClick={() => setMode("login")}
                aria-pressed={mode === "login"}
                className={`rounded-pill px-5 py-2 text-label-bold transition ${
                  mode === "login"
                    ? "bg-primary text-on-primary tactile-pop dark:bg-white dark:text-brand-ink"
                    : "text-on-surface-variant dark:text-dark-textMuted"
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                aria-pressed={mode === "register"}
                className={`rounded-pill px-5 py-2 text-label-bold transition ${
                  mode === "register"
                    ? "bg-primary text-on-primary tactile-pop dark:bg-white dark:text-brand-ink"
                    : "text-on-surface-variant dark:text-dark-textMuted"
                }`}
              >
                Criar conta
              </button>
            </div>

            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-body-sm font-bold text-danger">
                <Icon name="error" size={18} /> <span>{error}</span>
              </div>
            )}

            {mode === "login" ? (
              <form onSubmit={login} className="grid gap-4">
                <Input name="email" label="E-mail" type="email" leftIcon="account_circle" required autoComplete="email" />
                <Input name="senha" label="Senha" type="password" required autoComplete="current-password" />
                <Button type="submit" variant="accent" size="lg" loading={isSubmitting} fullWidth rightIcon="arrow_forward">
                  Entrar
                </Button>
                <p className="text-center text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                  Ainda não tem conta?{" "}
                  <button type="button" onClick={() => setMode("register")} className="font-bold text-accent-deep underline dark:text-accent-soft">
                    Criar agora
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={register} className="grid gap-4 md:grid-cols-2">
                <Input name="nome" label="Nome" required containerClassName="md:col-span-2" />
                <Input name="cpf" label="CPF" required minLength={11} />
                <Input name="email" label="E-mail" type="email" required autoComplete="email" />
                <Input name="senha" label="Senha" type="password" required minLength={8} autoComplete="new-password" />
                <Input name="telefone" label="Telefone" required />
                <Input name="endereco" label="Endereço" required containerClassName="md:col-span-2" />
                <Input name="numero" label="Número" required />
                <Input name="complemento" label="Complemento" />
                <Input name="bairro" label="Bairro" required />
                <Input name="cidade" label="Cidade" required />
                <Input name="estado" label="UF" required maxLength={2} />
                <Input name="cep" label="CEP" required />
                <Button type="submit" variant="accent" size="lg" loading={isSubmitting} fullWidth className="md:col-span-2" rightIcon="arrow_forward">
                  Criar conta
                </Button>
              </form>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}

export default AuthPage;
