import { Button } from "@/components/ui/Button";
import { SparkIcon } from "@/components/ui/Icons";
import { Placeholder } from "./Placeholder";

const SUGGESTIONS = ["Summarize this lecture", "What did I miss about the key idea?", "Where was the example?"];

// Future: call askLecture() from "@/lib/ai/client"; render answers + citations that seek the player.
export function AskTab() {
  return (
    <div>
      <Placeholder icon={<SparkIcon />} title="Ask this lecture">
        Soon, students will be able to ask a question and jump straight to the moment in the
        video that answers it. This feature isn’t available yet.
      </Placeholder>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled
            className="cursor-not-allowed rounded-full border border-white/10 px-3 py-1.5 text-xs text-subtle opacity-70"
          >
            {s}
          </button>
        ))}
      </div>

      <form className="mt-6 flex gap-2" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <input
          id="ask-input"
          disabled
          placeholder="Questions are coming soon"
          className="min-w-0 flex-1 rounded-xl border border-edge bg-black/30 px-4 py-3 text-sm placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button type="submit" disabled>
          Ask
        </Button>
      </form>
    </div>
  );
}
