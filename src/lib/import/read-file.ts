import { MAX_FILE_BYTES } from "@/lib/constants";
import type { ImportError } from "./types";

/**
 * Reads a user-picked file as UTF-8 text, refusing anything that isn't text.
 * The check is on content, not on the file name: spreadsheets, zips and
 * images contain NUL bytes or invalid UTF-8, whatever they're called.
 * A byte-order mark is dropped.
 * @param file  The picked file (a `File` is a `Blob`).
 * @returns     The text, or `too-large` / `not-text`.
 */
export async function readFile(file: Blob): Promise<{ ok: true; text: string } | { ok: false; error: ImportError }> {
  // Checked before reading, so a huge file is never loaded into memory.
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: { code: "too-large" } };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return { ok: false, error: { code: "not-text" } };
  }
  if (text.includes("\u0000")) {
    return { ok: false, error: { code: "not-text" } };
  }
  return { ok: true, text };
}
