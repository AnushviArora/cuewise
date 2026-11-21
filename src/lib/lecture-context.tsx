"use client";

import { clearChat } from "@/lib/ask/chat";
import { clearLectureContext } from "@/lib/ask/lectureContext";
import { stableLectureId } from "@/lib/share";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface Lecture {
  /** Stable for the same video file, so share links keep working after a re-upload. */
  id: string;
  /** Unique per upload (even of the same video): used to reset the workspace. */
  session: string;
  courseName: string;
  video: File;
  /** Browser-only blob URL. Never leaves the device. */
  videoUrl: string;
  /** Optional supporting PDFs: slides, lecture notes, handouts (0–15). */
  slides: File[];
}

interface LectureContextValue {
  lecture: Lecture | null;
  /** Resolves with the lecture id. */
  setLecture: (input: { courseName: string; video: File; slides: File[] }) => Promise<string>;
  clearLecture: () => void;
}

const LectureContext = createContext<LectureContextValue | null>(null);

/**
 * Holds the current lecture in memory (no database, no upload to a server).
 * A page reload clears it — the workspace then shows a friendly empty state.
 */
export function LectureProvider({ children }: { children: React.ReactNode }) {
  const [lecture, setLectureState] = useState<Lecture | null>(null);
  const urlRef = useRef<string | null>(null);
  const idRef = useRef<string | null>(null);

  const release = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    // The previous upload's chat and lecture data are never needed again.
    if (idRef.current) {
      clearChat(idRef.current);
      clearLectureContext(idRef.current);
      idRef.current = null;
    }
  };

  const setLecture = useCallback<LectureContextValue["setLecture"]>(async (input) => {
    const id = await stableLectureId(input.video);
    release();
    const videoUrl = URL.createObjectURL(input.video);
    urlRef.current = videoUrl;
    idRef.current = id;
    setLectureState({ ...input, id, session: crypto.randomUUID(), courseName: input.courseName.trim(), videoUrl });
    return id;
  }, []);

  const clearLecture = useCallback(() => {
    release();
    setLectureState(null);
  }, []);

  const value = useMemo(
    () => ({ lecture, setLecture, clearLecture }),
    [lecture, setLecture, clearLecture],
  );
  return <LectureContext.Provider value={value}>{children}</LectureContext.Provider>;
}

export function useLecture(): LectureContextValue {
  const ctx = useContext(LectureContext);
  if (!ctx) throw new Error("useLecture must be used inside <LectureProvider>");
  return ctx;
}
