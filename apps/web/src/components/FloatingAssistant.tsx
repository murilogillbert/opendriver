import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { assistantWelcomeText, AssistantQuickReply } from "../lib/assistantFlow";
import {
  advanceAssistant,
  AssistantEngineState,
  createInitialAssistantState,
  getQuickRepliesForStep
} from "../lib/localAssistantEngine";
import { createLeadFromAssistant, recordBotInteraction, sendChatMessage, ChatMessage } from "../lib/api";
import { createWhatsAppLeadUrl } from "../lib/whatsapp";
import { Icon } from "./ui";
import MessageBubble, { AssistantMessage } from "./assistant/MessageBubble";
import QuickReplies from "./assistant/QuickReplies";

type FloatingAssistantProps = {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
};

type StoredAssistantSession = {
  engineState: AssistantEngineState;
  messages: AssistantMessage[];
  createdLeadId?: number;
  // AI mode history — sent to Groq for context (last 12 turns)
  aiHistory: ChatMessage[];
};

const STORAGE_KEY = "open-driver-assistant-session-v2";

const createMessage = (role: AssistantMessage["role"], text: string): AssistantMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  text
});

const createInitialSession = (): StoredAssistantSession => ({
  engineState: createInitialAssistantState(),
  messages: [
    createMessage("assistant", assistantWelcomeText),
    createMessage("assistant", "Para começar: você dirige em qual modalidade?")
  ],
  aiHistory: []
});

function loadInitialSession() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return createInitialSession();
    return JSON.parse(stored) as StoredAssistantSession;
  } catch {
    return createInitialSession();
  }
}

function FloatingAssistant({ isOpen, onClose, onOpen }: FloatingAssistantProps) {
  const [session, setSession] = useState<StoredAssistantSession>(() => loadInitialSession());
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const quickReplies = useMemo<AssistantQuickReply[]>(
    () => getQuickRepliesForStep(session.engineState.step),
    [session.engineState.step]
  );

  const isReady = session.engineState.step === "ready";

  // Persist session to localStorage
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.messages, isTyping, isOpen]);

  // Auto-create lead when flow is completed
  useEffect(() => {
    if (session.engineState.step !== "ready" || session.createdLeadId) return;

    let cancelled = false;
    void createLeadFromAssistant(session.engineState.lead)
      .then((lead) => {
        if (!cancelled) {
          setSession((curr) =>
            curr.createdLeadId ? curr : { ...curr, createdLeadId: lead.id }
          );
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [session.createdLeadId, session.engineState.lead, session.engineState.step]);

  const resetSession = () => {
    const initial = createInitialSession();
    setSession(initial);
    setInput("");
    setIsTyping(false);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  };

  // ─── AI chat mode (step === "ready") ──────────────────────────────────────
  const handleAIMessage = async (userText: string) => {
    const newUserMsg: ChatMessage = { role: "user", content: userText };
    const historyToSend: ChatMessage[] = [...(session.aiHistory ?? []), newUserMsg].slice(-14) as ChatMessage[];

    const lead = session.engineState.lead;
    const leadContext = {
      driverType: lead.driverType ?? undefined,
      city: lead.city ?? undefined,
      mainPain: lead.mainPain ?? undefined
    };

    try {
      const aiResponse = await sendChatMessage({ messages: historyToSend, leadContext });

      const updatedHistory: ChatMessage[] = [
        ...historyToSend,
        { role: "assistant" as const, content: aiResponse }
      ].slice(-14);

      setSession((curr) => ({
        ...curr,
        messages: [...curr.messages, createMessage("assistant", aiResponse)],
        aiHistory: updatedHistory
      }));
    } catch {
      setSession((curr) => ({
        ...curr,
        messages: [
          ...curr.messages,
          createMessage(
            "assistant",
            "Ops, tive um problema de conexão agora. Tente novamente ou continue pelo WhatsApp 😊"
          )
        ]
      }));
    } finally {
      setIsTyping(false);
    }
  };

  // ─── Lead-capture flow (steps 1-3) ────────────────────────────────────────
  const handleLeadFlowMessage = (userText: string) => {
    window.setTimeout(() => {
      setSession((curr) => {
        const result = advanceAssistant(curr.engineState, userText);
        const assistantMessages = result.responses.map((r) => createMessage("assistant", r));
        const respostaBot = result.responses.join("\n");

        void recordBotInteraction({
          mensagemUsuario: userText,
          respostaBot,
          etapaFluxo: curr.engineState.step,
          leadId: curr.createdLeadId,
          lead: result.lead
        }).catch(() => undefined);

        return {
          ...curr,
          engineState: { step: result.step, lead: result.lead },
          messages: [...curr.messages, ...assistantMessages]
        };
      });
      setIsTyping(false);
    }, 520);
  };

  // ─── Main entry point ─────────────────────────────────────────────────────
  const answerUser = (value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue || isTyping) return;

    setInput("");
    setSession((curr) => ({
      ...curr,
      messages: [...curr.messages, createMessage("user", trimmedValue)]
    }));
    setIsTyping(true);

    if (isReady) {
      void handleAIMessage(trimmedValue);
    } else {
      handleLeadFlowMessage(trimmedValue);
    }
  };

  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    answerUser(input);
  };

  const openWhatsApp = () => {
    window.open(createWhatsAppLeadUrl(session.engineState.lead), "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Abrir assistente DriverHub"
        className={`focus-ring fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-pill bg-accent px-5 py-3.5 text-label-bold uppercase text-on-accent shadow-gold transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:brightness-105 sm:bottom-6 sm:right-6 ${
          isOpen ? "pointer-events-none translate-y-3 opacity-0" : "opacity-100"
        }`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-brand-ink text-white">
          <Icon name="star" size={16} filled />
        </span>
        Assistente
      </button>

      {/* Chat window */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[30rem] px-3 transition duration-300 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:px-0 ${
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0"
        }`}
        aria-hidden={!isOpen}
      >
        <section className="glass-card overflow-hidden rounded-t-3xl shadow-glass sm:rounded-3xl">
          {/* Header */}
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-label-sm uppercase text-accent-soft">
                {isReady ? "IA · Groq / Llama 3.3" : "IA local"}
              </p>
              <h2 className="mt-1 font-display text-title-md text-white">
                Assistente DriverHub
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetSession}
                className="focus-ring rounded-pill border border-white/15 px-3 py-1.5 text-label-sm uppercase text-white/70 transition hover:border-accent hover:text-accent-soft"
              >
                Reiniciar
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar assistente"
                className="focus-ring grid h-9 w-9 place-items-center rounded-pill bg-white text-brand-ink transition hover:bg-accent"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </header>

          {/* Messages */}
          <div className="max-h-[68vh] overflow-y-auto bg-brand-navy/70 px-4 py-5 sm:max-h-[31rem]">
            <div className="space-y-3">
              {session.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-pill bg-white px-4 py-3">
                    <span className="h-2 w-2 animate-pulse rounded-pill bg-accent" />
                    <span className="h-2 w-2 animate-pulse rounded-pill bg-accent [animation-delay:120ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-pill bg-accent [animation-delay:240ms]" />
                  </div>
                </div>
              )}

              {/* Quick replies during lead flow */}
              {!isReady && !isTyping && (
                <QuickReplies options={quickReplies} onSelect={answerUser} />
              )}

              {/* Ready state: WhatsApp CTA + AI chat enabled */}
              {isReady && !isTyping && session.aiHistory.length === 0 && (
                <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
                  <p className="text-body-sm text-white/85">
                    Perfil capturado! Tire dúvidas aqui com a IA ou continue pelo WhatsApp com um atendente.
                  </p>
                  <button
                    type="button"
                    onClick={openWhatsApp}
                    className="focus-ring mt-4 w-full rounded-pill bg-accent px-5 py-3.5 text-label-bold uppercase text-on-accent shadow-gold transition duration-300 hover:-translate-y-1 hover:brightness-105"
                  >
                    Continuar pelo WhatsApp
                  </button>
                </div>
              )}

              <div ref={scrollRef} />
            </div>
          </div>

          {/* Input */}
          <form onSubmit={submitMessage} className="flex gap-2 border-t border-white/10 bg-brand-ink p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isTyping}
              placeholder={
                isReady
                  ? "Pergunte qualquer coisa sobre a DriverHub..."
                  : "Digite sua resposta..."
              }
              className="focus-ring min-w-0 flex-1 rounded-pill border border-white/10 bg-white px-4 py-3 text-body-sm font-bold text-brand-ink outline-none transition placeholder:text-brand-navy/45 focus:border-accent disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isTyping || input.trim().length === 0}
              className="focus-ring flex items-center gap-1 rounded-pill bg-accent px-5 py-3 text-label-bold uppercase text-on-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="arrow_forward" size={16} />
              Enviar
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

export default FloatingAssistant;
