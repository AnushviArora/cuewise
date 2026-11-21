import { Workspace } from "@/features/workspace/Workspace";
import { parseQuestion, parseStart, parseTitle } from "@/lib/share";

export const metadata = { title: "Lecture — Cuewise" };

/** Shared link: /lecture/[id]?t=754. A bad or missing t just starts at 0:00. */
export default async function LecturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[]; q?: string | string[]; c?: string | string[] }>;
}) {
  const [{ id }, { t, q, c }] = await Promise.all([params, searchParams]);
  return <Workspace lectureId={id} startAt={parseStart(t)} question={parseQuestion(q)} title={parseTitle(c)} />;
}
