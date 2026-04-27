const benefits = [
  {
    title: "Cashback em serviços",
    description: "Economize em serviços essenciais do dia a dia",
    icon: "💳"
  },
  {
    title: "Desconto em combustível",
    description: "Gaste menos por corrida",
    icon: "⛽"
  },
  {
    title: "Manutenção com preço reduzido",
    description: "Parcerias com oficinas",
    icon: "🔧"
  },
  {
    title: "Plataforma exclusiva",
    description: "Tudo em um só lugar",
    icon: "📱"
  },
  {
    title: "Benefícios parceiros",
    description: "Vantagens reais para motoristas",
    icon: "🎁"
  }
];

function BenefitsSection() {
  return (
    <section id="beneficios" className="bg-white px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-black uppercase tracking-[0.22em] text-brand-green">
            Benefícios
          </span>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-brand-dark sm:text-5xl">
            Vantagens que aparecem no seu bolso
          </h2>
          <p className="mt-4 text-base leading-7 text-gray-600">
            Uma experiência simples, visual e direta para o motorista aproveitar mais.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <article
              key={benefit.title}
              className="group rounded-[2rem] border border-gray-100 bg-white p-6 shadow-soft transition duration-300 hover:-translate-y-2 hover:scale-[1.02] hover:border-green-100 hover:shadow-lg"
            >
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-3xl bg-green-50 text-4xl transition duration-300 group-hover:scale-110 group-hover:bg-green-100">
                <span aria-hidden="true">{benefit.icon}</span>
              </div>
              <h3 className="text-xl font-black tracking-tight text-brand-dark">
                {benefit.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">{benefit.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default BenefitsSection;
