import { FormEvent, useEffect, useMemo, useState } from "react";

import logoUrl from "../../assets/driverhub-logo.svg";
import {
  clearPartnerToken,
  friendlyPartnerError,
  getPartnerToken,
  moneyBR,
  partnerApi
} from "../../lib/partnerApi";
import type {
  PartnerLookup,
  PartnerProfile,
  PartnerRedemption,
  PartnerStats
} from "../../lib/partnerApi";
import PartnerAnalyticsTab from "./PartnerAnalyticsTab";
import PartnerPayoutsTab from "./PartnerPayoutsTab";
import PartnerProductsTab from "./PartnerProductsTab";
import PartnerReceivablesTab from "./PartnerReceivablesTab";

type Phase = "checking" | "login" | "must_change_password" | "ready";

function PartnerApp() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [recent, setRecent] = useState<PartnerRedemption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Validate any existing partner token on first mount.
  useEffect(() => {
    if (!getPartnerToken()) {
      setPhase("login");
      return;
    }
    void partnerApi
      .profile()
      .then(async (data) => {
        setProfile(data);
        await refreshTerminalData();
        setPhase("ready");
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "password_change_required") {
          setPhase("must_change_password");
        } else {
          clearPartnerToken();
          setPhase("login");
        }
      });
  }, []);

  const refreshTerminalData = async () => {
    const [statsResp, redemptionsResp] = await Promise.all([
      partnerApi.stats().catch(() => null),
      partnerApi.recentRedemptions(15).catch(() => [])
    ]);
    setStats(statsResp);
    setRecent(redemptionsResp);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const senha = String(formData.get("senha") ?? "");
    try {
      const session = await partnerApi.login(email, senha);
      if (session.user.password_must_change) {
        setPhase("must_change_password");
        return;
      }
      const data = await partnerApi.profile();
      setProfile(data);
      await refreshTerminalData();
      setPhase("ready");
    } catch (err) {
      setError(friendlyPartnerError(err, "Nao foi possivel entrar."));
    }
  };

  const handleLogout = async () => {
    await partnerApi.logout();
    setProfile(null);
    setPhase("login");
  };

  if (phase === "checking") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b1220] text-white">
        <p className="text-sm font-bold">Verificando sessao do parceiro...</p>
      </main>
    );
  }

  if (phase === "login") {
    return (
      <PartnerLogin onSubmit={handleLogin} error={error} info={info} />
    );
  }

  if (phase === "must_change_password") {
    return (
      <PartnerChangePassword
        onDone={async () => {
          setInfo("Senha atualizada. Bem vindo ao terminal.");
          setError(null);
          const data = await partnerApi.profile();
          setProfile(data);
          await refreshTerminalData();
          setPhase("ready");
        }}
        onCancel={async () => {
          await partnerApi.logout();
          setPhase("login");
        }}
      />
    );
  }

  if (!profile) return null;

  return (
    <PartnerTerminal
      profile={profile}
      stats={stats}
      recent={recent}
      onRefresh={refreshTerminalData}
      onLogout={handleLogout}
    />
  );
}

function PartnerLogin({
  onSubmit,
  error,
  info
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string | null;
  info: string | null;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0b1220] px-5 text-white">
      <section className="grid w-full max-w-md gap-5 rounded-xl border border-white/10 bg-[#101a2e] p-7 shadow-2xl">
        <header className="grid gap-2 text-center">
          <img src={logoUrl} alt="DriverHub" className="mx-auto h-12 w-auto" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">Terminal do parceiro</p>
          <h1 className="font-display text-2xl font-black">Entrar para validar cupons</h1>
          <p className="text-xs font-bold text-white/55">
            Use o email cadastrado e a senha enviada pelo Open Driver.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-200">
            {info}
          </div>
        )}

        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/60">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-xl border border-white/15 bg-[#0b1220] px-3 py-3 text-sm font-bold text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none"
              placeholder="parceiro@empresa.com"
            />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/60">
            Senha
            <input
              name="senha"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-xl border border-white/15 bg-[#0b1220] px-3 py-3 text-sm font-bold text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none"
              placeholder="••••••"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-brand-ink shadow-gold"
          >
            Entrar no terminal
          </button>
        </form>
      </section>
    </main>
  );
}

function PartnerChangePassword({
  onDone,
  onCancel
}: {
  onDone: () => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (next.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (next !== confirm) {
      setError("Confirmacao da senha nao confere.");
      return;
    }
    setSubmitting(true);
    try {
      await partnerApi.changePassword(current, next);
      await onDone();
    } catch (err) {
      setError(friendlyPartnerError(err, "Nao foi possivel trocar a senha."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#0b1220] px-5 text-white">
      <section className="grid w-full max-w-md gap-4 rounded-xl border border-white/10 bg-[#101a2e] p-7 shadow-2xl">
        <header className="grid gap-2 text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">Primeiro acesso</p>
          <h1 className="font-display text-2xl font-black">Defina sua senha</h1>
          <p className="text-xs font-bold text-white/55">
            Por seguranca, voce precisa trocar a senha padrao antes de operar.
          </p>
        </header>
        {error && (
          <div className="rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/60">
            Senha atual
            <input
              name="current"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-xl border border-white/15 bg-[#0b1220] px-3 py-3 text-sm font-bold text-white"
            />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/60">
            Nova senha (min 6)
            <input
              name="next"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="rounded-xl border border-white/15 bg-[#0b1220] px-3 py-3 text-sm font-bold text-white"
            />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/60">
            Confirme a nova senha
            <input
              name="confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="rounded-xl border border-white/15 bg-[#0b1220] px-3 py-3 text-sm font-bold text-white"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-brand-ink disabled:opacity-60"
          >
            {submitting ? "Salvando..." : "Salvar nova senha"}
          </button>
          <button
            type="button"
            onClick={() => void onCancel()}
            className="text-xs font-bold text-white/55 underline-offset-2 hover:underline"
          >
            Cancelar e sair
          </button>
        </form>
      </section>
    </main>
  );
}

type PartnerTab = "terminal" | "produtos" | "analytics" | "recebiveis" | "saques";

function PartnerTerminal({
  profile,
  stats,
  recent,
  onRefresh,
  onLogout
}: {
  profile: PartnerProfile;
  stats: PartnerStats | null;
  recent: PartnerRedemption[];
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [tab, setTab] = useState<PartnerTab>("terminal");
  const [token, setToken] = useState("");
  const [lookup, setLookup] = useState<PartnerLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setToken("");
    setLookup(null);
    setError(null);
    setInfo(null);
  };

  const doLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLookup(null);
    if (!token.trim()) {
      setError("Digite ou escaneie o token de 12 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const data = await partnerApi.lookup(token);
      setLookup(data);
      if (!data.usable) {
        if (data.expired) setError("Voucher expirado.");
        else if (data.exhausted) setError("Voucher sem usos disponiveis.");
        else setError(`Voucher com status ${data.status}, nao pode ser validado.`);
      }
    } catch (err) {
      setError(friendlyPartnerError(err, "Nao foi possivel consultar o voucher."));
    } finally {
      setBusy(false);
    }
  };

  const confirmRedeem = async () => {
    if (!lookup) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await partnerApi.redeem({ redemption_token: token });
      setInfo(
        `Voucher ${lookup.voucher_code ?? token.toUpperCase()} validado para ${lookup.cliente_primeiro_nome}. Pode liberar o beneficio.`
      );
      reset();
      await onRefresh();
    } catch (err) {
      setError(friendlyPartnerError(err, "Nao foi possivel validar."));
    } finally {
      setBusy(false);
    }
  };

  const usableHint = useMemo(() => {
    if (!lookup) return null;
    if (lookup.delivery_method === "presencial") return "Beneficio presencial — entregue o servico ao cliente.";
    if (lookup.offer_type === "voucher") return "Voucher — aplique o desconto no caixa.";
    if (lookup.offer_type === "servico") return "Servico — execute conforme combinado.";
    return "Beneficio liberado para o cliente.";
  }, [lookup]);

  return (
    <main className="min-h-screen bg-[#0b1220] text-white">
      <header className="border-b border-white/10 bg-[#101a2e]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-gold">Terminal do parceiro</p>
            <h1 className="font-display text-2xl font-black">{profile.nome_fantasia}</h1>
            <p className="text-xs font-bold text-white/60">
              Operador: {profile.operator.nome} ({profile.operator.email}) · {profile.cidade}/{profile.estado}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="self-start rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-black"
          >
            Sair
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl flex-wrap gap-1 px-5 pb-3">
          {(
            [
              ["terminal", "Terminal"],
              ["produtos", "Produtos"],
              ["analytics", "Analytics"],
              ["recebiveis", "Recebiveis"],
              ["saques", "Saques"]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider transition ${
                tab === key
                  ? "bg-brand-gold text-brand-ink"
                  : "border border-white/15 bg-white/5 text-white/70 hover:border-brand-gold hover:text-brand-gold"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab !== "terminal" && (
        <section className="mx-auto max-w-5xl px-5 py-6">
          <div className="rounded-xl bg-white p-5 text-slate-800">
            {tab === "produtos" && <PartnerProductsTab />}
            {tab === "analytics" && <PartnerAnalyticsTab />}
            {tab === "recebiveis" && <PartnerReceivablesTab />}
            {tab === "saques" && <PartnerPayoutsTab />}
          </div>
        </section>
      )}

      {tab === "terminal" && (
      <section className="mx-auto grid max-w-5xl gap-5 px-5 py-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="grid gap-4 rounded-xl border border-white/10 bg-[#101a2e] p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Validar cupom</p>
            <h2 className="mt-1 font-display text-2xl font-black">Cole ou digite o codigo</h2>
            <p className="mt-1 text-xs font-bold text-white/55">
              Aceita o token de 12 letras (QR de resgate) ou o codigo OD-XXXXXXXX (voucher digital).
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-200">
              {info}
            </div>
          )}

          <form onSubmit={doLookup} className="grid gap-3">
            <input
              value={token}
              onChange={(event) => setToken(event.target.value.toUpperCase())}
              placeholder="K7M3LFXP9TQR ou OD-A24A9F03"
              autoFocus
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              className="rounded-xl border border-white/15 bg-[#0b1220] px-4 py-4 text-center font-mono text-xl font-black tracking-[0.2em] text-white placeholder:text-white/25 focus:border-brand-gold focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-brand-ink disabled:opacity-60"
              >
                {busy ? "Buscando..." : "Buscar voucher"}
              </button>
              {(token || lookup) && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-black"
                >
                  Limpar
                </button>
              )}
            </div>
          </form>

          {lookup && (
            <div className="grid gap-3 rounded-xl border border-brand-gold/30 bg-brand-gold/10 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-gold">{lookup.offer_type ?? "beneficio"}</p>
                  <h3 className="mt-1 text-lg font-black">{lookup.produto_nome}</h3>
                  <p className="mt-1 text-xs font-bold text-white/70">
                    Cliente: {lookup.cliente_primeiro_nome} · Valor referencia {moneyBR(lookup.economia_estimada)}
                  </p>
                  {lookup.voucher_code && (
                    <p className="mt-1 text-xs font-bold text-white/70">
                      Voucher digital: <code className="font-mono text-white">{lookup.voucher_code}</code>
                    </p>
                  )}
                </div>
                <span
                  className={`rounded-xl px-2 py-1 text-xs font-black uppercase tracking-[0.1em] ${
                    lookup.usable ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200"
                  }`}
                >
                  {lookup.usable ? "Usavel" : lookup.status}
                </span>
              </div>
              <p className="text-xs font-bold text-white/70">
                {lookup.redemption_limit != null
                  ? `${lookup.redemption_count}/${lookup.redemption_limit} usos${lookup.expires_at ? " · expira em " + new Date(lookup.expires_at).toLocaleDateString("pt-BR") : ""}`
                  : "uso ilimitado"}
              </p>
              {usableHint && lookup.usable && (
                <p className="text-xs font-bold text-white/80">{usableHint}</p>
              )}
              {lookup.usable && (
                <button
                  type="button"
                  onClick={() => void confirmRedeem()}
                  disabled={busy}
                  className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-emerald-950 disabled:opacity-60"
                >
                  {busy ? "Validando..." : "Confirmar resgate"}
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="grid gap-4">
          <div className="grid gap-3 rounded-xl border border-white/10 bg-[#101a2e] p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Hoje no balcao</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Resgates hoje" value={String(stats?.resgates_hoje ?? 0)} />
              <Stat label="No mes" value={String(stats?.resgates_mes ?? 0)} />
              <Stat label="A receber" value={moneyBR(stats?.a_receber ?? 0)} />
              <Stat label="Total pago" value={moneyBR(stats?.pago_total ?? 0)} />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#101a2e] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Ultimos resgates</p>
              <button
                type="button"
                onClick={() => void onRefresh()}
                className="text-xs font-black text-brand-gold underline-offset-2 hover:underline"
              >
                Atualizar
              </button>
            </div>
            <ul className="mt-3 grid gap-2 text-sm">
              {recent.length === 0 ? (
                <li className="text-xs font-bold text-white/55">Nenhum resgate registrado ainda.</li>
              ) : (
                recent.map((entry) => (
                  <li key={entry.id} className="grid gap-1 border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                    <strong className="text-sm font-black">{entry.produto_nome}</strong>
                    <span className="text-xs font-bold text-white/60">
                      {entry.cliente_nome} · {new Date(entry.redeemed_at).toLocaleString("pt-BR")} · {moneyBR(entry.valor_referencia)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-white/55">{label}</p>
      <strong className="mt-1 block text-lg font-black">{value}</strong>
    </div>
  );
}

export default PartnerApp;
