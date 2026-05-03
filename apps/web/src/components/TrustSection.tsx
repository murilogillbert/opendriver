const trustItems = [
  {
    title: "Plataforma em crescimento nacional",
    value: "Brasil"
  },
  {
    title: "Suporte direto",
    value: "WhatsApp"
  },
  {
    title: "Sem compromisso inicial",
    value: "Livre"
  }
];

function TrustSection() {
  return (
    <section className="bg-brand-bone px-4 py-16 text-brand-ink sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-sm font-black uppercase tracking-[0.22em] text-brand-gold">
              Confiança
            </span>
            <h2 className="mt-3 font-display text-3xl font-black sm:text-5xl">
              Feito para motorista decidir com segurança
            </h2>
          </div>
          <p className="max-w-md text-base font-semibold leading-7 text-brand-navy/62">
            Prova simples, clara e próxima do CTA, como uma landing de alta conversão precisa ser.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {trustItems.map((item) => (
            <article
              key={item.title}
              className="rounded-[2rem] bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-soft"
            >
              <p className="font-display text-3xl font-black text-brand-gold">{item.value}</p>
              <h3 className="mt-4 text-lg font-black leading-snug text-brand-ink">{item.title}</h3>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrustSection;
