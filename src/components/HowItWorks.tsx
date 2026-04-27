const steps = [
  { title: "Se cadastra", icon: "📝" },
  { title: "Ativa benefícios", icon: "⚙️" },
  { title: "Começa a ganhar mais", icon: "💰" }
];

function HowItWorks() {
  return (
    <section className="bg-white px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="text-sm font-black uppercase tracking-[0.22em] text-brand-green">
            Como funciona
          </span>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-brand-dark sm:text-5xl">
            Simples, rápido e sem enrolação
          </h2>
        </div>

        <div className="mt-12 flex flex-col gap-5 md:flex-row md:items-stretch">
          {steps.map((step, index) => (
            <div key={step.title} className="flex flex-1 flex-col md:flex-row">
              <article className="flex flex-1 items-center gap-5 rounded-[2rem] border border-gray-100 bg-gray-50 p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg md:flex-col md:justify-center md:text-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white text-4xl shadow-sm">
                  <span aria-hidden="true">{step.icon}</span>
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-brand-green">
                    Passo {index + 1}
                  </p>
                  <h3 className="mt-1 text-xl font-black text-brand-dark">{step.title}</h3>
                </div>
              </article>

              {index < steps.length - 1 && (
                <div className="mx-auto h-8 w-px bg-green-200 md:mx-5 md:my-auto md:h-px md:w-16" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
