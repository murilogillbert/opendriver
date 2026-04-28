const steps = [
  {
    title: "Se cadastra",
    description: "Você chama no WhatsApp e fala com o assistente.",
    icon: "01"
  },
  {
    title: "Ativa benefícios",
    description: "A Open mostra as vantagens disponíveis para seu perfil.",
    icon: "02"
  },
  {
    title: "Começa a ganhar mais",
    description: "Você economiza na rotina e melhora o lucro por corrida.",
    icon: "03"
  }
];

function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-brand-bone px-4 py-16 text-brand-ink sm:px-8 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-brand-ink p-8 text-white shadow-navy">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-brand-gold/25 blur-3xl" />
          <span className="relative text-sm font-black uppercase tracking-[0.22em] text-brand-gold">
            Jornada rápida
          </span>
          <h2 className="relative mt-4 font-display text-4xl font-black tracking-tight sm:text-6xl">
            Simples, direto e pronto para rodar
          </h2>
          <p className="relative mt-5 text-lg font-semibold leading-8 text-white/68">
            A disposição segue um fluxo de compra: entender o valor, escolher entrar e acionar o
            atendimento.
          </p>

          <div className="relative mt-10 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Ativação média
            </p>
            <p className="mt-2 font-display text-5xl font-black text-brand-gold">3 passos</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="group grid gap-5 rounded-[2rem] bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-soft sm:grid-cols-[5rem_1fr]"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-brand-navy font-display text-2xl font-black text-brand-gold transition duration-300 group-hover:scale-105">
                {step.icon}
              </div>
              <div className="self-center">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">
                  Passo {index + 1}
                </p>
                <h3 className="mt-1 font-display text-2xl font-black text-brand-ink">{step.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-navy/62">
                  {step.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
