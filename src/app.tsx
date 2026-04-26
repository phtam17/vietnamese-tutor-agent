import { useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import type { ChatAgent } from "./server";

const QUICK_PROMPTS = [
  "/start",
  "/lesson Greetings and introductions",
  "/quiz",
  "/correct Tôi thích đi ăn phở vào ngày mai hôm qua"
];

function messageText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false)
  });

  const { messages, sendMessage, clearHistory, status, stop } = useAgentChat({
    agent
  });
  const isStreaming = status === "streaming" || status === "submitted";

  const visibleMessages = useMemo(
    () => messages.filter((message) => messageText(message).length > 0),
    [messages]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages, isStreaming]);

  function submit(text: string) {
    const value = text.trim();
    if (!value || isStreaming) return;
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: value }]
    });
    setInput("");
  }

  return (
    <main className="h-screen bg-zinc-50 text-zinc-900">
      <section className="mx-auto flex h-full max-w-4xl flex-col px-4 py-4">
        <header className="mb-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-semibold">Vietnamese Tutor Agent</h1>
            <p className="text-sm text-zinc-500">
              {connected ? "Connected" : "Connecting..."}
            </p>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Commands: <code>/start</code>, <code>/lesson</code>,{" "}
            <code>/quiz</code>, <code>/correct ...</code>
          </p>
        </header>

        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm hover:bg-zinc-100"
              disabled={isStreaming}
              onClick={() => submit(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <section className="flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white px-4 py-4">
          {visibleMessages.length === 0 && (
            <p className="text-sm text-zinc-500">
              Start chatting in English or Vietnamese. The tutor will remember
              your level and common mistakes.
            </p>
          )}

          <div className="space-y-3">
            {visibleMessages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      isUser
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-900"
                    }`}
                  >
                    {messageText(message)}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        </section>

        <form
          className="mt-3 rounded-xl border border-zinc-200 bg-white p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
        >
          <textarea
            className="w-full resize-none rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-zinc-500"
            rows={3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={!connected || isStreaming}
            placeholder="Type Vietnamese practice here..."
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50"
              onClick={clearHistory}
              disabled={isStreaming}
            >
              Clear history
            </button>
            {isStreaming ? (
              <button
                type="button"
                className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm text-white"
                onClick={stop}
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={!connected || input.trim().length === 0}
              >
                Send
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
