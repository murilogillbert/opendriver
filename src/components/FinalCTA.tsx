type FinalCTAProps = {
  onCtaClick: () => void;
};

function FinalCTA({ onCtaClick }: FinalCTAProps) {
  return (
    <section className="bg-white px-5 py-16 pb-28 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-black tracking-tight text-brand-dark sm:text-5xl">
          Comece agora e aumente seu ganho como motorista
        </h2>
        <button
          type="button"
          onClick={onCtaClick}
          className="mt-8 w-full rounded-2xl bg-brand-green px-7 py-5 text-base font-black uppercase tracking-wide text-white shadow-soft shadow-green-900/20 transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-200 sm:w-auto sm:min-w-80"
        >
          Entrar na Open Driver
        </button>
      </div>
    </section>
  );
}

export default FinalCTA;
