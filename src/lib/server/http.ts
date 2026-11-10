import "server-only";
import { NextResponse } from "next/server";

/** Placeholder response for routes whose AI feature isn't built yet. */
export function notImplemented(feature: string) {
  return NextResponse.json(
    { error: "not_implemented", message: `${feature} isn’t available yet.` },
    { status: 501 },
  );
}
