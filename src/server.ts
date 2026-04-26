import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText
} from "ai";
import { createWorkersAI } from "workers-ai-provider";

type LearnerLevel = "beginner" | "intermediate" | "advanced";
type LearnerGoal = "travel" | "conversation" | "business" | "exam";

type LearnerProfile = {
  level: LearnerLevel;
  goal: LearnerGoal;
};

type TutorState = {
  profile: LearnerProfile | null;
  known_vocab: string[];
  mistake_patterns: string[];
  last_lesson_topic: string | null;
  updated_at: string;
};

type Command = "lesson" | "quiz" | "correct" | "start" | "none";

const LESSON_TOPICS = [
  "introductions and greetings",
  "ordering food and drinks",
  "asking for directions",
  "shopping and numbers",
  "family and daily routines"
];

export class ChatAgent extends AIChatAgent<Env, TutorState> {
  initialState: TutorState = {
    profile: null,
    known_vocab: [],
    mistake_patterns: [],
    last_lesson_topic: null,
    updated_at: new Date().toISOString()
  };

  maxPersistedMessages = 80;

  @callable()
  getTutorMemory(): TutorState {
    return this.state;
  }

  @callable()
  setLearnerProfile(level: LearnerLevel, goal: LearnerGoal): TutorState {
    this.setState({
      ...this.state,
      profile: { level, goal },
      updated_at: new Date().toISOString()
    });
    return this.state;
  }

  @callable()
  resetTutorMemory(): TutorState {
    this.setState({
      profile: null,
      known_vocab: [],
      mistake_patterns: [],
      last_lesson_topic: null,
      updated_at: new Date().toISOString()
    });
    return this.state;
  }

  private getLastUserText(): string {
    for (let i = this.messages.length - 1; i >= 0; i -= 1) {
      const message = this.messages[i];
      if (message.role !== "user") continue;
      const text = message.parts
        .filter(
          (part): part is Extract<typeof part, { type: "text" }> =>
            part.type === "text"
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text) return text;
    }
    return "";
  }

  private pushUniqueLimited(
    list: string[],
    values: string[],
    cap: number
  ): string[] {
    const next = [...list];
    for (const value of values) {
      const cleaned = value.trim();
      if (!cleaned) continue;
      if (!next.includes(cleaned)) next.push(cleaned);
    }
    return next.slice(-cap);
  }

  private detectCommand(text: string): { command: Command; args: string } {
    const trimmed = text.trim();
    if (trimmed.startsWith("/lesson"))
      return { command: "lesson", args: trimmed.replace("/lesson", "").trim() };
    if (trimmed.startsWith("/quiz")) return { command: "quiz", args: "" };
    if (trimmed.startsWith("/correct"))
      return {
        command: "correct",
        args: trimmed.replace("/correct", "").trim()
      };
    if (trimmed.startsWith("/start"))
      return { command: "start", args: trimmed.replace("/start", "").trim() };
    return { command: "none", args: "" };
  }

  private updateFromUserInput(
    userText: string,
    command: Command,
    args: string
  ): void {
    const lower = userText.toLowerCase();
    const nextMistakes = [...this.state.mistake_patterns];

    if (command === "correct" && args) {
      nextMistakes.push("grammar correction requested");
    }
    if (lower.includes("tone")) nextMistakes.push("tone confusion");
    if (lower.includes("pronoun")) nextMistakes.push("pronoun mismatch");

    const words = userText
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}-]/gu, ""))
      .filter((token) => token.length >= 3)
      .slice(0, 6);

    this.setState({
      ...this.state,
      known_vocab: this.pushUniqueLimited(this.state.known_vocab, words, 100),
      mistake_patterns: this.pushUniqueLimited(
        this.state.mistake_patterns,
        nextMistakes,
        50
      ),
      updated_at: new Date().toISOString()
    });
  }

  private getCommandInstruction(command: Command, args: string): string {
    if (command === "lesson") {
      const explicitTopic =
        args || this.state.last_lesson_topic || LESSON_TOPICS[0];
      return `User requested /lesson. Teach this topic: "${explicitTopic}". Output: short explanation, 3 examples (Vietnamese + English gloss), then 1 practice prompt.`;
    }
    if (command === "quiz") {
      const topic = this.state.last_lesson_topic || LESSON_TOPICS[1];
      return `User requested /quiz. Create exactly 3 questions for "${topic}": 1 vocab recall, 1 sentence construction, 1 situational response.`;
    }
    if (command === "correct") {
      return `User requested /correct. Use this strict format: Corrected sentence, What changed (bullets), Why it matters, Simpler alternative.`;
    }
    if (command === "start") {
      return "User requested /start. Ask for level (beginner/intermediate/advanced) and goal (travel/conversation/business/exam) if missing, then confirm profile.";
    }
    return "Normal tutor mode. Keep responses concise and include one optional practice prompt.";
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const lastUserText = this.getLastUserText();
    const { command, args } = this.detectCommand(lastUserText);
    this.updateFromUserInput(lastUserText, command, args);

    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `
You are VietCoach, a supportive Vietnamese tutor.

Current learner memory (JSON):
${JSON.stringify(this.state)}

Teaching policy:
- Adapt to learner level and goal from memory.
- Keep responses concise and actionable.
- Default output: explanation, examples, then practice prompt.
- If the user writes Vietnamese, provide correction-focused feedback.

Command policy:
${this.getCommandInstruction(command, args)}
      `.trim(),
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
