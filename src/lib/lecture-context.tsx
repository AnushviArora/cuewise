"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface Lecture {
  /** Unique per upload. Everything derived from this lecture is tied to it. */
  id: string;
  courseName: string;
  video: File;
  /** Browser-only blob URL. Never leaves the device. */
  videoUrl: string;
  /** Optional supporting PDFs: slides, lecture notes, handouts (0–15). */
  slides: File[];
}

interface LectureContextValue {
  lecture: Lecture | null;
  setLecture: (input: { courseName: string; video: File; slides: File[] }) => void;
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

  const release = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const setLecture = useCallback<LectureContextValue["setLecture"]>((input) => {
    release();
    const videoUrl = URL.createObjectURL(input.video);
    urlRef.current = videoUrl;
    setLectureState({ ...input, id: crypto.randomUUID(), courseName: input.courseName.trim(), videoUrl });
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
