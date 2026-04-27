type HeroSectionProps = {
  onCtaClick: () => void;
};

function HeroSection({ onCtaClick }: HeroSectionProps) {
  return (
    <section className="relative isolate overflow-hidden bg-white px-5 pb-16 pt-6 sm:px-8 sm:pb-24">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(22,163,74,0.12),transparent_36%)]" />
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-center sm:justify-between">
          <a href="#topo" className="flex items-center gap-3" aria-label="Open Driver">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-green text-xl font-black text-white shadow-lg shadow-green-700/20">
              OD
            </span>
            <span className="text-xl font-black tracking-tight text-brand-dark">
              Open <span className="text-brand-green">Driver</span>
            </span>
          </a>

          <button
            type="button"
            onClick={onCtaClick}
            className="hidden rounded-full border border-green-200 bg-white px-5 py-3 text-sm font-extrabold text-brand-green shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-brand-green hover:shadow-md sm:inline-flex"
          >
            Falar agora
          </button>
        </header>

        <div id="topo" className="mx-auto mt-14 max-w-4xl text-center sm:mt-20">
          <span className="inline-flex rounded-full bg-green-50 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-brand-green ring-1 ring-green-100">
            Benefícios para motoristas
          </span>

          <h1 className="mt-6 text-4xl font-black leading-tight tracking-[-0.04em] text-brand-dark sm:text-6xl lg:text-7xl">
            Ganhe mais como motorista com a Open Driver
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-gray-600 sm:text-xl">
            Benefícios reais, mais lucro por corrida e suporte direto pra você crescer
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={onCtaClick}
              className="w-full rounded-2xl bg-brand-green px-7 py-5 text-base font-black uppercase tracking-wide text-white shadow-soft shadow-green-900/20 transition duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-200 sm:w-auto sm:min-w-80"
            >
              Quero aumentar meu ganho
            </button>
          </div>

          <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
            {["Descontos reais", "Atendimento direto", "Sem compromisso"].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-gray-100 bg-white/85 px-4 py-4 text-sm font-bold text-gray-700 shadow-sm backdrop-blur"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
