import "server-only";

/**
 * OpenAI-compatible 的最小客户端。
 *
 * 不装 openai SDK：只用到 /embeddings 和 /chat/completions 两个接口，
 * fetch 就够了，也省得为了兼容各家 Base URL 去绕 SDK 的行为。
 */

export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** 统一处理结尾斜杠和用户误填 `/chat/completions` 的情况。 */
export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  url = url.replace(/\/(chat\/completions|embeddings)$/, "");
  return url;
}

function endpoint(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

async function post(
  config: Pick<ProviderConfig, "baseUrl" | "apiKey">,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(endpoint(config.baseUrl, path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "网络错误";
    throw new LlmError(`无法连接到 ${normalizeBaseUrl(config.baseUrl)}：${reason}`);
  }

  if (!res.ok) {
    // 错误正文可能含有敏感信息，截断后再抛
    const text = await res.text().catch(() => "");
    const detail = text.slice(0, 300);
    throw new LlmError(
      `接口返回 ${res.status}${detail ? `：${detail}` : ""}`,
      res.status,
    );
  }

  return res;
}

/** 429 和 5xx 是瞬时错误，值得重试；4xx（除 429）是配置问题，重试没意义。 */
export function isTransient(e: unknown): boolean {
  if (!(e instanceof LlmError)) return false;
  if (e.status === undefined) return true; // 网络层错误
  return e.status === 429 || e.status >= 500;
}

const MAX_RETRIES = 3;

export async function withRetry<T>(
  fn: () => Promise<T>,
  delayMs = (attempt: number) => 1000 * 2 ** attempt,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === MAX_RETRIES || !isTransient(e)) break;
      // 指数退避：1s、2s、4s
      await new Promise((r) => setTimeout(r, delayMs(attempt)));
    }
  }

  throw lastError;
}

/** 批量生成 embedding，返回顺序与入参一致。瞬时错误会自动重试。 */
export async function createEmbeddings(
  config: ProviderConfig,
  input: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  if (input.length === 0) return [];

  const res = await withRetry(() =>
    post(config, "/embeddings", { model: config.embeddingModel, input }, signal),
  );

  const json = (await res.json()) as {
    data?: { index: number; embedding: number[] }[];
  };

  if (!json.data || json.data.length !== input.length) {
    throw new LlmError(
      `Embedding 数量不匹配：请求 ${input.length} 条，返回 ${json.data?.length ?? 0} 条。`,
    );
  }

  // 有些实现不保证顺序，按 index 排一次
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** 流式对话，逐段吐出文本增量。 */
export async function* streamChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await post(
    config,
    "/chat/completions",
    { model: config.chatModel, messages, stream: true, temperature: 0.3 },
    signal,
  );

  if (!res.body) throw new LlmError("接口没有返回流式响应。");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE 以空行分隔事件
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 不完整的 JSON 片段，跳过
        }
      }
    }
  }
}

export type TestResult = {
  ok: boolean;
  chatOk: boolean;
  embeddingOk: boolean;
  /** embedding 维度，用来提醒用户和数据库的 vector(1536) 是否匹配 */
  embeddingDimensions?: number;
  error?: string;
};

/** 设置页的「测试连接」：分别打一次 chat 和 embedding。 */
export async function testConnection(
  config: ProviderConfig,
): Promise<TestResult> {
  const result: TestResult = { ok: false, chatOk: false, embeddingOk: false };

  try {
    const vectors = await createEmbeddings(config, ["连接测试"]);
    result.embeddingOk = true;
    result.embeddingDimensions = vectors[0]?.length;
  } catch (e) {
    result.error = `Embedding 模型：${e instanceof Error ? e.message : "未知错误"}`;
    return result;
  }

  try {
    const res = await post(config, "/chat/completions", {
      model: config.chatModel,
      messages: [{ role: "user", content: "回复 ok" }],
      max_tokens: 5,
      stream: false,
    });
    await res.json();
    result.chatOk = true;
  } catch (e) {
    result.error = `Chat 模型：${e instanceof Error ? e.message : "未知错误"}`;
    return result;
  }

  result.ok = result.chatOk && result.embeddingOk;
  return result;
}
