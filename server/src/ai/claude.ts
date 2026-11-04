// Тонкий клиент Claude API без зависимостей: структурированный JSON-ответ, кеш системного промпта, повторы.
// Ключ — только из ANTHROPIC_API_KEY на сервере.
import { readFileSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url);
const models = JSON.parse(readFileSync(new URL("server/src/config/models.json", ROOT), "utf8"));

export type Role = "translate" | "dialog" | "helper";

export class AiError extends Error {
  code: "no_api_key" | "api_error" | "refusal" | "bad_output";
  constructor(code: AiError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export interface AiOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function modelFor(role: Role): { model: string; max_tokens: number; cache_ttl: string } {
  return models.ai[role];
}

export function costUsd(usage: Usage, model: string, cacheTtl = "1h"): number {
  const p = models.pricing_usd_per_mtok[model];
  if (!p || !usage) return 0;
  const write = cacheTtl === "1h" ? p.cache_write_1h : p.cache_write_5m;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_creation_input_tokens ?? 0) * write +
      (usage.cache_read_input_tokens ?? 0) * p.cache_read) /
    1_000_000
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Один запрос к Claude. Если передана schema — ответ строго JSON по ней (структурированный вывод),
 * иначе — текст. Системный промпт кешируется (он одинаковый для всех учеников).
 */
export async function callClaude<T = unknown>(
  role: Role,
  args: { system: string; user: string; schema?: object },
  opts: AiOptions = {},
): Promise<{ data: T; usage: Usage; costUsd: number; model: string }> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiError("no_api_key", "ANTHROPIC_API_KEY is not set");
  const doFetch = opts.fetchImpl ?? fetch;
  const { model, max_tokens, cache_ttl } = modelFor(role);
  const body: any = {
    model,
    max_tokens,
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral", ttl: cache_ttl } }],
    messages: [{ role: "user", content: args.user }],
  };
  if (args.schema) body.output_config = { format: { type: "json_schema", schema: args.schema } };

  const retries = opts.maxRetries ?? 2;
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const after = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await sleep(Math.min(after, 8) * 1000);
      continue;
    }
    if (!res.ok) throw new AiError("api_error", `Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const out: any = await res.json();
    if (out.stop_reason === "refusal") throw new AiError("refusal", "Model refused");
    if (out.stop_reason === "max_tokens" && attempt < retries) {
      body.max_tokens = Math.min(body.max_tokens * 2, 3000);
      continue;
    }
    const text: string = out.content?.find((b: any) => b.type === "text")?.text ?? "";
    let data: any = text;
    if (args.schema) {
      try {
        data = JSON.parse(text);
      } catch {
        if (attempt < retries) continue;
        throw new AiError("bad_output", "Could not parse JSON");
      }
    }
    return { data, usage: out.usage, costUsd: costUsd(out.usage, model, cache_ttl), model };
  }
}
