type BotSectionProps = {
  onCtaClick: () => void;
};

function BotSection({ onCtaClick }: BotSectionProps) {
  return (
    <section className="px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand-green px-6 py-12 text-center text-white shadow-soft shadow-green-900/20 sm:px-12 sm:py-16">
        <span className="inline-flex rounded-full bg-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-green-50 ring-1 ring-white/20">
          Atendimento no WhatsApp
        </span>
        <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
          Atendimento rápido e direto
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-green-50">
          Nosso assistente vai te explicar tudo e já te ativar
        </p>
        <button
          type="button"
          onClick={onCtaClick}
          className="mt-8 w-full rounded-2xl bg-white px-7 py-5 text-base font-black uppercase tracking-wide text-brand-green shadow-lg transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-green-50 focus:outline-none focus:ring-4 focus:ring-white/40 sm:w-auto sm:min-w-96"
        >
          Falar com atendimento agora
        </button>
      </div>
    </section>
  );
}

export default BotSection;
