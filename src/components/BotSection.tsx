type BotSectionProps = {
  onCtaClick: () => void;
};

function BotSection({ onCtaClick }: BotSectionProps) {
  return (
    <section id="atendimento" className="bg-white px-4 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-brand-ink text-white shadow-navy">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-brand-gold p-8 text-brand-ink sm:p-12">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-brand-ink/55">
              Bot principal
            </span>
            <h2 className="mt-4 font-display text-4xl font-black tracking-tight sm:text-6xl">
              Atendimento rápido e direto
            </h2>
          </div>

          <div className="p-8 sm:p-12">
            <p className="text-lg font-semibold leading-8 text-white/72">
              Nosso assistente vai te explicar tudo e já te ativar. Sem login, sem formulário longo
              e sem perder tempo.
            </p>
            <button
              type="button"
              onClick={onCtaClick}
              className="mt-8 w-full rounded-full bg-white px-7 py-5 text-sm font-black uppercase tracking-[0.18em] text-brand-ink shadow-lg transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-brand-gold focus:outline-none focus:ring-4 focus:ring-white/30 sm:w-auto sm:min-w-96"
            >
              Falar com atendimento agora
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default BotSection;
