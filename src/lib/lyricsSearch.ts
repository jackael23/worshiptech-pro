/**
 * 2026-11-09: "Hanapin ang lyrics sa web" in the Song Editor. Only opens a normal web search in a
 * new tab — the app itself never downloads lyrics from other sites (copyright / site terms). The
 * user copies the lyrics from a page they trust and pastes them into the Lyrics box.
 */
export function lyricsSearchUrl(title: string, author = ""): string | null {
  const t = title.trim();
  if (!t) return null;
  const q = [`"${t}"`, author.trim(), "lyrics"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
