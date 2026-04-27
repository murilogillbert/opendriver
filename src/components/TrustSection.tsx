const trustItems = [
  {
    title: "Plataforma em crescimento nacional",
    icon: "🚀"
  },
  {
    title: "Suporte direto",
    icon: "💬"
  },
  {
    title: "Sem compromisso inicial",
    icon: "🔒"
  }
];

function TrustSection() {
  return (
    <section className="bg-gray-100 px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-4 sm:grid-cols-3">
          {trustItems.map((item) => (
            <article
              key={item.title}
              className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-3xl">
                <span aria-hidden="true">{item.icon}</span>
              </div>
              <h3 className="text-base font-black leading-snug text-brand-dark">{item.title}</h3>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrustSection;
