const benefits = [
  {
    title: "Cashback em serviços",
    description: "Economize em serviços essenciais do dia a dia",
    eyebrow: "Cashback",
    icon: "R$"
  },
  {
    title: "Desconto em combustível",
    description: "Gaste menos por corrida",
    eyebrow: "Combustível",
    icon: "%"
  },
  {
    title: "Manutenção com preço reduzido",
    description: "Parcerias com oficinas",
    eyebrow: "Oficinas",
    icon: "01"
  },
  {
    title: "Plataforma exclusiva",
    description: "Tudo em um só lugar",
    eyebrow: "App",
    icon: "24h"
  },
  {
    title: "Benefícios parceiros",
    description: "Vantagens reais para motoristas",
    eyebrow: "Clube",
    icon: "+"
  }
];

function BenefitsSection() {
  return (
    <section id="beneficios" className="bg-brand-bone px-4 py-16 text-brand-ink sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="text-sm font-black uppercase tracking-[0.22em] text-brand-gold">
              Mais buscados
            </span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-brand-ink sm:text-5xl">
              Um clube de vantagens com cara de produto premium
            </h2>
          </div>
          <p className="max-w-md text-base font-semibold leading-7 text-brand-navy/62">
            Como na vitrine de um app moderno: direto ao ponto, fácil de entender e pronto para
            ativar pelo atendimento.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {benefits.slice(0, 3).map((benefit, index) => (
            <article
              key={benefit.title}
              className="group min-h-80 overflow-hidden rounded-[2rem] bg-brand-ink p-6 text-white shadow-soft transition duration-300 hover:-translate-y-2 hover:shadow-navy"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-brand-gold/35 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brand-gold">
                  {benefit.eyebrow}
                </span>
                <span className="font-display text-sm font-black text-white/35">0{index + 1}</span>
              </div>

              <div className="mt-12 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-brand-gold font-display text-3xl font-black text-brand-ink transition duration-300 group-hover:scale-110 group-hover:bg-brand-goldLight">
                {benefit.icon}
              </div>

              <h3 className="mt-8 font-display text-2xl font-black tracking-tight">{benefit.title}</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-white/65">{benefit.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {benefits.slice(3).map((benefit) => (
            <article
              key={benefit.title}
              className="group flex min-h-48 items-center gap-5 rounded-[2rem] border border-brand-navy/10 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-2 hover:shadow-soft"
            >
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.75rem] bg-brand-navy font-display text-2xl font-black text-brand-gold transition duration-300 group-hover:scale-110">
                {benefit.icon}
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-gold">
                  {benefit.eyebrow}
                </span>
                <h3 className="mt-2 font-display text-2xl font-black text-brand-ink">{benefit.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-navy/60">
                  {benefit.description}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-[2rem] bg-white p-6 shadow-soft sm:p-8">
          <span className="text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
            Vitrine DriverHub
          </span>
          <p className="mt-3 font-display text-2xl font-black text-brand-ink sm:text-3xl">
            Benefícios organizados para o motorista entender rápido e decidir sem fricção.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Sem app pesado", "Sem contrato inicial", "Sem cadastro longo"].map((item) => (
              <div key={item} className="rounded-2xl bg-brand-bone px-5 py-4 text-sm font-black text-brand-navy">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default BenefitsSection;
