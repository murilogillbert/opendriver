import { FormEvent, useState } from "react";
import type { InputHTMLAttributes } from "react";

import { marketplaceApi } from "../../lib/marketplaceApi";

function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));

    try {
      await marketplaceApi.login(String(values.email), String(values.senha));
      window.history.pushState(null, "", "/minha-conta");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      setError("Email ou senha invalidos.");
    }
  };

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));

    try {
      await marketplaceApi.register(values);
      window.history.pushState(null, "", "/minha-conta");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      setError("Nao foi possivel criar a conta. Verifique os dados.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-10 text-[#111827]">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-md border border-[#dfe5ef] bg-white">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-brand-ink p-8 text-white">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
              Minha Opendriver
            </p>
            <h1 className="mt-4 font-display text-4xl font-black">
              Acompanhe seus vouchers e sua economia acumulada.
            </h1>
            <p className="mt-4 text-sm font-semibold leading-6 text-white/70">
              Cadastre-se uma vez, confirme endereco e receba produtos digitais por email ou
              fisicos no endereco cadastrado.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="mb-6 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`rounded-md px-4 py-2 text-sm font-black ${mode === "login" ? "bg-brand-ink text-white" : "bg-[#eef2f7]"}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`rounded-md px-4 py-2 text-sm font-black ${mode === "register" ? "bg-brand-ink text-white" : "bg-[#eef2f7]"}`}
              >
                Cadastro
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {error}
              </div>
            )}

            {mode === "login" ? (
              <form onSubmit={login} className="grid gap-4">
                <Input name="email" label="Email" type="email" required />
                <Input name="senha" label="Senha" type="password" required />
                <button className="rounded-md bg-brand-gold px-5 py-3 text-sm font-black text-brand-ink">
                  Entrar
                </button>
              </form>
            ) : (
              <form onSubmit={register} className="grid gap-4 md:grid-cols-2">
                <Input name="nome" label="Nome" required />
                <Input name="email" label="Email" type="email" required />
                <Input name="senha" label="Senha" type="password" required minLength={8} />
                <Input name="telefone" label="Telefone" required />
                <Input name="endereco" label="Endereco" required />
                <Input name="numero" label="Numero" required />
                <Input name="complemento" label="Complemento" />
                <Input name="bairro" label="Bairro" required />
                <Input name="cidade" label="Cidade" required />
                <Input name="estado" label="UF" required maxLength={2} />
                <Input name="cep" label="CEP" required />
                <button className="rounded-md bg-brand-gold px-5 py-3 text-sm font-black text-brand-ink md:col-span-2">
                  Criar conta
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;

  return (
    <label className="grid gap-1 text-sm font-bold">
      {label}
      <input {...inputProps} className="rounded-md border border-[#ccd5e2] px-3 py-2" />
    </label>
  );
}

export default AuthPage;
