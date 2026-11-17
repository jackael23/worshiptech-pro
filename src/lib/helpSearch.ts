/**
 * 2026-11-17 (Jarvis): Help chat answers without AI — musician tools first (transpose / capo),
 * then the best-matching article from lib/helpKb.ts by keyword score. Runs in the browser,
 * so it works on Firebase Hosting and with no internet.
 * Pure functions (no DOM / storage) so they can be tested on their own.
 */
import { HELP_ARTICLES, HelpArticle } from "./helpKb";
import { answerMusicQuestion } from "./musicTools";

type Language = "Tagalog" | "English" | "Taglish";

/** Lower-case, no accents, punctuation → spaces (keeps + # / : for "ctrl+b", "f#", "3:16"). */
export function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#/:\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Score of one article: phrases (2+ words) count 3 per word, single words count 1 (2 when long). */
function scoreArticle(query: string, words: Set<string>, article: HelpArticle): number {
  let score = 0;
  for (const raw of article.keywords) {
    const kw = normalize(raw);
    if (!kw) continue;
    if (kw.includes(" ")) {
      if (` ${query} `.includes(` ${kw} `)) score += 3 * kw.split(" ").length;
    } else if (words.has(kw)) {
      score += kw.length >= 6 ? 2 : 1;
    }
  }
  // the article title itself is a strong hint
  for (const t of [article.title.tl, article.title.en]) {
    const title = normalize(t);
    if (title && ` ${query} `.includes(` ${title} `)) score += 4;
  }
  return score;
}

export function rankArticles(question: string): Array<{ article: HelpArticle; score: number }> {
  const query = normalize(question);
  const words = new Set(query.split(" ").filter(Boolean));
  return HELP_ARTICLES.map((article) => ({ article, score: scoreArticle(query, words, article) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

const MIN_SCORE = 2;

export interface HelpAnswer {
  text: string;
  /** which article answered (null = music tool or no match) — for tests */
  articleId: string | null;
  kind: "music" | "article" | "none";
}

export function answerHelpQuestion(question: string, language: Language): HelpAnswer {
  const en = language === "English";
  const music = answerMusicQuestion(question, language);
  if (music) return { text: music, articleId: null, kind: "music" };

  const ranked = rankArticles(question);
  const best = ranked[0];
  // a one- or two-word question ("capo", "hi") only needs one matching keyword
  const short = normalize(question).split(" ").filter(Boolean).length <= 2;
  if (best && best.score >= (short ? 1 : MIN_SCORE)) {
    const related = ranked
      .slice(1, 3)
      .filter((r) => r.score >= MIN_SCORE)
      .map((r) => `*${en ? r.article.title.en : r.article.title.tl}*`);
    const more = related.length ? `\n\n---\n${en ? "Related" : "Kaugnay"}: ${related.join(" · ")}` : "";
    return { text: (en ? best.article.en : best.article.tl) + more, articleId: best.article.id, kind: "article" };
  }

  // no good match: show the closest topics (or the main ones)
  const picks = (ranked.length ? ranked.map((r) => r.article) : HELP_ARTICLES.filter((a) => ["add-song", "chords", "transpose", "stage-screen"].includes(a.id))).slice(0, 4);
  const list = picks.map((a) => `- ${en ? a.title.en : a.title.tl}`).join("\n");
  const text = en
    ? `Sorry, I don't have an answer for that yet. 🙏 This Help works offline with ready-made answers (no AI), so try shorter words, like *chords*, *Bible*, *projector* or *G to E*.\n\n**Maybe one of these?**\n${list}\n\n_You can also open **Guides** or practice in the **Simulator**._`
    : `Pasensya, wala pa akong sagot diyan. 🙏 Offline at nakahandang sagot lang ang Help na ito (walang AI), kaya subukan ang mas maikling salita, gaya ng *chords*, *Bible*, *projector* o *G to E*.\n\n**Baka isa sa mga ito?**\n${list}\n\n_Pwede ring buksan ang **Guides** o mag-practice sa **Simulator**._`;
  return { text, articleId: null, kind: "none" };
}
