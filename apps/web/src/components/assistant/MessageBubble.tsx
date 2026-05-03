export type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type MessageBubbleProps = {
  message: AssistantMessage;
};

function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[86%] rounded-[1.4rem] px-4 py-3 text-sm font-semibold leading-6 shadow-sm ${
          isAssistant
            ? "rounded-bl-md bg-white text-brand-ink"
            : "rounded-br-md bg-brand-gold text-brand-ink"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

export default MessageBubble;
