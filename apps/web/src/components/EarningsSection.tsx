function EarningsSection() {
  return (
    <section className="bg-white px-4 py-16 text-brand-ink sm:px-8 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-6 overflow-hidden rounded-[2.5rem] bg-brand-navy p-6 text-white shadow-navy lg:grid-cols-[0.85fr_1.15fr] lg:p-10">
        <div className="rounded-[2rem] border border-brand-gold/25 bg-brand-ink p-7">
          <span className="text-sm font-black uppercase tracking-[0.22em] text-brand-gold">
            Mais lucro
          </span>
          <h2 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-5xl">
            Motoristas estão aumentando seus ganhos com a Open
          </h2>
        </div>

        <div className="flex flex-col justify-center rounded-[2rem] bg-brand-gold p-7 text-brand-ink">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-brand-ink/55">
            Destaque de conversão
          </p>
          <p className="mt-4 font-display text-4xl font-black leading-none tracking-tight sm:text-6xl">
            Até R$300 a mais por mês
          </p>
          <p className="mt-4 max-w-2xl text-base font-extrabold leading-7 text-brand-ink/70">
            Só com benefícios, descontos e parceiros pensados para quem roda todos os dias.
          </p>
        </div>
      </div>
    </section>
  );
}

export default EarningsSection;
