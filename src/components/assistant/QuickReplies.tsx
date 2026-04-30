import { AssistantQuickReply } from "../../lib/assistantFlow";

type QuickRepliesProps = {
  options: AssistantQuickReply[];
  onSelect: (value: string) => void;
};

function QuickReplies({ options, onSelect }: QuickRepliesProps) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          className="rounded-full border border-brand-gold/30 bg-brand-gold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-brand-gold transition duration-300 hover:-translate-y-0.5 hover:bg-brand-gold hover:text-brand-ink"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default QuickReplies;
