import { SparkIcon } from "@/components/ui/Icons";
import { Placeholder } from "./Placeholder";

// Future: call reviewCaptions() from "@/lib/ai/client" and render ReviewSuggestion[] here.
export function ReviewTab() {
  return (
    <div>
      <Placeholder icon={<SparkIcon />} title="Nothing to review yet">
        Soon, Cuewise will flag professor names, technical terms and course jargon that
        auto-captions likely got wrong, so you only check what matters instead of rereading
        the whole transcript.
      </Placeholder>
      <div aria-hidden className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="h-3 w-16 rounded bg-white/10" />
            <div className="h-3 flex-1 rounded bg-white/[0.06]" />
            <div className="h-6 w-14 rounded-lg bg-white/[0.08]" />
          </div>
        ))}
      </div>
    </div>
  );
}
