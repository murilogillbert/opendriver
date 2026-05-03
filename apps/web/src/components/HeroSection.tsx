import logo from "../assets/open-driver-logo.svg";

type HeroSectionProps = {
  onCtaClick: () => void;
};

function HeroSection({ onCtaClick }: HeroSectionProps) {
  return (
    <section className="relative isolate overflow-hidden bg-brand-ink px-4 pb-12 pt-4 sm:px-8 lg:pb-20">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(214,178,94,0.20),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(13,34,56,0.95),transparent_34%),linear-gradient(135deg,#05070b_0%,#071525_52%,#020617_100%)]" />
      <div className="absolute left-1/2 top-20 -z-10 h-80 w-80 -translate-x-1/2 rounded-full border border-white/5 sm:h-[520px] sm:w-[520px]" />

      <div className="mx-auto max-w-7xl">
        <div className="mb-4 rounded-full border border-brand-gold/25 bg-brand-gold px-4 py-2 text-center text-[0.68rem] font-black uppercase tracking-[0.22em] text-brand-ink sm:text-xs">
          Benefícios premium para motoristas parceiros
        </div>

        <header className="flex items-center justify-between rounded-[1.75rem] border border-white/10 bg-white/[0.06] px-4 py-3 shadow-navy backdrop-blur-xl sm:px-5">
          <a href="#topo" className="flex items-center gap-3" aria-label="Open Driver">
            <img
              src={logo}
              alt="Logo Open Driver"
              className="h-12 w-12 rounded-2xl border border-white/10 object-cover"
            />
            <span className="font-display text-lg font-black tracking-tight text-white sm:text-xl">
              Open <span className="text-brand-gold">Driver</span>
            </span>
          </a>

          <nav className="hidden items-center gap-7 text-xs font-extrabold uppercase tracking-[0.18em] text-white/70 lg:flex">
            <a className="transition hover:text-brand-gold" href="#beneficios">
              Benefícios
            </a>
            <a className="transition hover:text-brand-gold" href="#como-funciona">
              Como funciona
            </a>
            <a className="transition hover:text-brand-gold" href="#atendimento">
              Atendimento
            </a>
          </nav>

          <button
            type="button"
            onClick={onCtaClick}
            className="hidden rounded-full bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-brand-ink shadow-sm transition duration-300 hover:-translate-y-0.5 hover:bg-brand-gold hover:shadow-gold sm:inline-flex"
          >
            Falar agora
          </button>
        </header>

        <div id="topo" className="grid items-center gap-10 pb-6 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12 lg:pt-20">
          <div className="text-center lg:text-left">
            <span className="inline-flex rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
              MVP Open Driver
            </span>

            <h1 className="mt-6 font-display text-4xl font-black leading-[0.96] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
              Ganhe mais como motorista com a Open Driver
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/72 sm:text-xl lg:mx-0">
              Benefícios reais, mais lucro por corrida e suporte direto pra você crescer.
            </p>

            <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row lg:items-start">
              <button
                type="button"
                onClick={onCtaClick}
                className="w-full rounded-full bg-brand-gold px-8 py-5 text-sm font-black uppercase tracking-[0.18em] text-brand-ink shadow-gold transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-brand-goldLight focus:outline-none focus:ring-4 focus:ring-brand-gold/30 sm:w-auto"
              >
                Quero aumentar meu ganho
              </button>
              <a
                href="#beneficios"
                className="w-full rounded-full border border-white/15 px-8 py-5 text-center text-sm font-black uppercase tracking-[0.18em] text-white transition duration-300 hover:-translate-y-1 hover:border-brand-gold hover:text-brand-gold sm:w-auto"
              >
                Ver benefícios
              </a>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {["Descontos reais", "Ativação rápida", "Sem compromisso"].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-sm font-extrabold text-white/82 backdrop-blur"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[34rem]">
            <div className="absolute -inset-5 rounded-[3rem] bg-brand-gold/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.08] p-4 shadow-navy backdrop-blur-xl">
              <div className="rounded-[2rem] bg-brand-bone p-5 text-brand-ink">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-navy/50">
                      Painel do motorista
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-black">Benefícios ativos</h2>
                  </div>
                  <img src={logo} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                </div>

                <div className="mt-6 rounded-[1.75rem] bg-brand-navy p-5 text-white">
                  <p className="text-sm font-bold text-white/60">Economia estimada</p>
                  <p className="mt-2 font-display text-4xl font-black text-brand-gold">R$300</p>
                  <p className="mt-1 text-sm font-bold text-white/70">a mais por mês com vantagens</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    ["Combustível", "-12%"],
                    ["Manutenção", "parceiros"],
                    ["Cashback", "ativo"],
                    ["Suporte", "direto"]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-navy/45">
                        {label}
                      </p>
                      <p className="mt-2 text-lg font-black text-brand-navy">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute -bottom-5 left-4 right-4 rounded-3xl border border-brand-gold/30 bg-brand-ink px-5 py-4 text-center text-sm font-black uppercase tracking-[0.18em] text-brand-gold shadow-gold">
              Ativação pelo WhatsApp
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/10 pt-8 sm:grid-cols-3">
          {[
            ["01", "Benefícios no bolso"],
            ["02", "Suporte sem burocracia"],
            ["03", "Experiência estilo app"]
          ].map(([number, label]) => (
            <div key={label} className="flex items-center gap-4 rounded-3xl bg-white/[0.06] p-5">
              <span className="font-display text-2xl font-black text-brand-gold">{number}</span>
              <span className="text-sm font-extrabold uppercase tracking-[0.16em] text-white/78">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
