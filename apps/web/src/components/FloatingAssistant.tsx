import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { assistantWelcomeText, AssistantQuickReply } from "../lib/assistantFlow";
import {
  advanceAssistant,
  AssistantEngineState,
  createInitialAssistantState,
  getQuickRepliesForStep
} from "../lib/localAssistantEngine";
import { createLeadFromAssistant, recordBotInteraction } from "../lib/api";
import { createWhatsAppLeadUrl } from "../lib/whatsapp";
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
};

const STORAGE_KEY = "open-driver-assistant-session-v1";

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
  ]
});

function loadInitialSession() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return createInitialSession();
    }

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

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.messages, isTyping, isOpen]);

  useEffect(() => {
    if (session.engineState.step !== "ready" || session.createdLeadId) {
      return;
    }

    let cancelled = false;

    void createLeadFromAssistant(session.engineState.lead)
      .then((lead) => {
        if (!cancelled) {
          setSession((currentSession) =>
            currentSession.createdLeadId
              ? currentSession
              : {
                  ...currentSession,
                  createdLeadId: lead.id
                }
          );
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [session.createdLeadId, session.engineState.lead, session.engineState.step]);

  const resetSession = () => {
    const initialSession = createInitialSession();
    setSession(initialSession);
    setInput("");
    setIsTyping(false);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialSession));
  };

  const answerUser = (value: string) => {
    const trimmedValue = value.trim();

    if (!trimmedValue || isTyping) {
      return;
    }

    setInput("");
    setSession((currentSession) => ({
      ...currentSession,
      messages: [...currentSession.messages, createMessage("user", trimmedValue)]
    }));
    setIsTyping(true);

    window.setTimeout(() => {
      setSession((currentSession) => {
        const result = advanceAssistant(currentSession.engineState, trimmedValue);
        const assistantMessages = result.responses.map((response) =>
          createMessage("assistant", response)
        );
        const respostaBot = result.responses.join("\n");

        void recordBotInteraction({
          mensagemUsuario: trimmedValue,
          respostaBot,
          etapaFluxo: currentSession.engineState.step,
          leadId: currentSession.createdLeadId,
          lead: result.lead
        }).catch(() => undefined);

        return {
          engineState: {
            step: result.step,
            lead: result.lead
          },
          messages: [...currentSession.messages, ...assistantMessages]
        };
      });
      setIsTyping(false);
    }, 520);
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
      <button
        type="button"
        onClick={onOpen}
        aria-label="Abrir assistente da Open Driver"
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full bg-brand-gold px-5 py-4 text-sm font-black uppercase tracking-wide text-brand-ink shadow-gold transition duration-300 hover:-translate-y-1 hover:scale-105 hover:bg-brand-goldLight focus:outline-none focus:ring-4 focus:ring-brand-gold/30 sm:bottom-6 sm:right-6 ${
          isOpen ? "pointer-events-none translate-y-3 opacity-0" : "opacity-100"
        }`}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-ink text-xs text-white">
          AI
        </span>
        Assistente Open
      </button>

      <div
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[30rem] px-3 transition duration-300 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:px-0 ${
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0"
        }`}
        aria-hidden={!isOpen}
      >
        <section className="overflow-hidden rounded-t-[2rem] border border-white/10 bg-brand-ink shadow-navy sm:rounded-[2rem]">
          <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.06] px-5 py-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
                IA local
              </p>
              <h2 className="mt-1 font-display text-lg font-black text-white">
                Assistente Open Driver
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetSession}
                className="rounded-full border border-white/10 px-3 py-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-brand-gold hover:text-brand-gold"
              >
                Reiniciar
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar assistente"
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-black text-brand-ink transition hover:bg-brand-gold"
              >
                ×
              </button>
            </div>
          </header>

          <div className="max-h-[68vh] overflow-y-auto bg-brand-navy/80 px-4 py-5 sm:max-h-[31rem]">
            <div className="space-y-3">
              {session.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-full bg-white px-4 py-3">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand-gold" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand-gold [animation-delay:120ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand-gold [animation-delay:240ms]" />
                  </div>
                </div>
              )}

              {!isReady && !isTyping && (
                <QuickReplies options={quickReplies} onSelect={answerUser} />
              )}

              {isReady && !isTyping && (
                <div className="rounded-[1.5rem] border border-brand-gold/30 bg-brand-gold/10 p-4">
                  <p className="text-sm font-semibold leading-6 text-white/72">
                    Próximo passo: enviar seu resumo para um atendimento humano no WhatsApp.
                  </p>
                  <button
                    type="button"
                    onClick={openWhatsApp}
                    className="mt-4 w-full rounded-full bg-brand-gold px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-brand-ink shadow-gold transition duration-300 hover:-translate-y-1 hover:bg-brand-goldLight"
                  >
                    Continuar pelo WhatsApp
                  </button>
                </div>
              )}

              <div ref={scrollRef} />
            </div>
          </div>

          <form onSubmit={submitMessage} className="flex gap-2 border-t border-white/10 bg-brand-ink p-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isTyping}
              placeholder={isReady ? "Resumo pronto para o WhatsApp" : "Digite sua resposta..."}
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white px-4 py-3 text-sm font-bold text-brand-ink outline-none transition placeholder:text-brand-navy/45 focus:border-brand-gold focus:ring-4 focus:ring-brand-gold/20 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isTyping || input.trim().length === 0}
              className="rounded-full bg-brand-gold px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-brand-ink transition hover:bg-brand-goldLight disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

export default FloatingAssistant;
