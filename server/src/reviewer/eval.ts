// Прогон эталонного набора через настоящий Claude API.
// Запуск: ANTHROPIC_API_KEY=... npm run eval   → отчёт в server/eval/results/<дата>.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { reviewPrompt } from "./review.ts";
import { loadReviewContext } from "./lesson.ts";

const base = new URL("../../eval/", import.meta.url);
const { cases } = JSON.parse(readFileSync(new URL("cases.json", base), "utf8"));

let passed = 0;
let totalCost = 0;
const results: any[] = [];

for (const c of cases) {
  const ctx = loadReviewContext(c.lesson, c.exercise, c.lang);
  const started = Date.now();
  try {
    const r = await reviewPrompt(ctx, c.prompt);
    const problems: string[] = [];
    if (c.expect.verdict && !c.expect.verdict.includes(r.verdict)) problems.push(`verdict ${r.verdict}, expected ${c.expect.verdict.join("|")}`);
    if (c.expect.privacy !== undefined && r.review.privacy_issue.found !== c.expect.privacy) problems.push("privacy flag mismatch");
    const text = JSON.stringify(r.review);
    for (const s of c.expect.must_not_contain ?? []) if (text.includes(s)) problems.push(`leaked "${s}"`);
    totalCost += r.costUsd;
    if (problems.length === 0) passed++;
    results.push({ id: c.id, ok: problems.length === 0, problems, score: r.score, verdict: r.verdict, ms: Date.now() - started, cost: r.costUsd, usage: r.usage, review: r.review });
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.id.padEnd(22)} ${String(r.score).padStart(4)} ${r.verdict.padEnd(8)} ${problems.join("; ")}`);
  } catch (e: any) {
    results.push({ id: c.id, ok: false, error: e.message });
    console.log(`ERR  ${c.id.padEnd(22)} ${e.message}`);
  }
}

console.log(`\n${passed}/${cases.length} passed, cost $${totalCost.toFixed(5)}`);
// In GitHub Actions: failures as annotations, visible on the run page (and via the API) without the log.
if (process.env.GITHUB_ACTIONS) {
  const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  for (const r of results.filter((x) => !x.ok)) {
    const detail = r.error ? `error: ${r.error}` : `${r.problems.join("; ")} (score ${r.score}). Gaps: ${(r.review?.gaps ?? []).map((g: any) => g.text ?? g).join(" | ")}`;
    console.log(`::error title=eval ${r.id}::${esc(detail.slice(0, 900))}`);
  }
  console.log(`::notice title=Reviewer eval::${passed}/${cases.length} passed, cost $${totalCost.toFixed(5)}`);
}
mkdirSync(new URL("results/", base), { recursive: true });
writeFileSync(new URL(`results/${new Date().toISOString().slice(0, 10)}.json`, base), JSON.stringify(results, null, 2));
process.exit(passed === cases.length ? 0 : 1);
