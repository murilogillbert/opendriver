type FinalCTAProps = {
  onCtaClick: () => void;
};

function FinalCTA({ onCtaClick }: FinalCTAProps) {
  return (
    <section className="bg-brand-ink px-4 py-16 pb-32 text-white sm:px-8 sm:py-24">
      <div className="mx-auto max-w-5xl rounded-[2.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(214,178,94,0.12))] p-8 text-center shadow-navy sm:p-14">
        <span className="text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
          Próximo passo
        </span>
        <h2 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-5xl">
          Comece agora e aumente seu ganho como motorista
        </h2>
        <button
          type="button"
          onClick={onCtaClick}
          className="mt-8 w-full rounded-full bg-brand-gold px-7 py-5 text-sm font-black uppercase tracking-[0.18em] text-brand-ink shadow-gold transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-brand-goldLight focus:outline-none focus:ring-4 focus:ring-brand-gold/30 sm:w-auto sm:min-w-80"
        >
          Entrar na DriverHub
        </button>
      </div>
    </section>
  );
}

export default FinalCTA;
