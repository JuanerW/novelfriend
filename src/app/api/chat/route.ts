import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProviderConfig } from "@/lib/llm/provider";
import { streamChat } from "@/lib/llm/client";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  NO_EVIDENCE_REPLY,
} from "@/lib/llm/prompt";
import {
  searchWithinProgress,
  buildContext,
  buildCitations,
  type Citation,
} from "@/lib/retrieval/search";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 响应是 NDJSON 流，每行一个事件：
 *   {"type":"meta","conversationId":…,"maxChapter":…,"citations":[…]}
 *   {"type":"delta","text":"…"}
 *   {"type":"done"}
 *   {"type":"error","error":"…"}
 */
type Event =
  | { type: "meta"; conversationId: string; maxChapter: number; citations: Citation[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const bookId = String(body?.bookId ?? "");
  const question = String(body?.question ?? "").trim();
  const incomingConversationId = body?.conversationId
    ? String(body.conversationId)
    : null;

  if (!bookId || !question) {
    return NextResponse.json(
      { error: "缺少 bookId 或问题内容。" },
      { status: 400 },
    );
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "问题太长了。" }, { status: 400 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, status")
    .eq("id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!book) return NextResponse.json({ error: "书籍不存在" }, { status: 404 });

  if (book.status !== "ready") {
    return NextResponse.json(
      { error: "这本书还没有生成索引，请先在书架点「生成索引」。" },
      { status: 400 },
    );
  }

  // 阅读进度只从数据库读，不接受客户端传值
  const { data: progressRow } = await supabase
    .from("reading_progress")
    .select("chapter_index")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  const maxChapter = progressRow?.chapter_index ?? 1;

  let config;
  try {
    config = await loadProviderConfig(user.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取 LLM 配置失败。" },
      { status: 500 },
    );
  }
  if (!config) {
    return NextResponse.json(
      { error: "请先到设置页填写 LLM API 配置。" },
      { status: 400 },
    );
  }

  // 检索
  let chunks;
  try {
    chunks = await searchWithinProgress(supabase, config, {
      bookId,
      maxChapter,
      question,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "检索失败。" },
      { status: 500 },
    );
  }

  // 章节标题用于引用展示
  const { data: titleRows } = await supabase
    .from("chapters")
    .select("chapter_index, title")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .lte("chapter_index", maxChapter);

  const titles = new Map<number, string>(
    (titleRows ?? []).map((r) => [r.chapter_index as number, r.title as string]),
  );
  const citations = buildCitations(chunks, titles);

  // 会话
  let conversationId = incomingConversationId;
  if (conversationId) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .maybeSingle();
    if (!conv) conversationId = null;
  }
  if (!conversationId) {
    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, book_id: bookId })
      .select("id")
      .single();
    if (error || !conv) {
      return NextResponse.json({ error: "创建会话失败。" }, { status: 500 });
    }
    conversationId = conv.id;
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: question,
    reader_chapter_snapshot: maxChapter,
  });

  const encoder = new TextEncoder();
  const line = (e: Event) => encoder.encode(JSON.stringify(e) + "\n");

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        line({ type: "meta", conversationId: conversationId!, maxChapter, citations }),
      );

      // 进度以内没有相关原文，直接给固定回答
      if (chunks.length === 0) {
        controller.enqueue(line({ type: "delta", text: NO_EVIDENCE_REPLY }));
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: NO_EVIDENCE_REPLY,
          reader_chapter_snapshot: maxChapter,
          citations_json: [],
        });
        controller.enqueue(line({ type: "done" }));
        controller.close();
        return;
      }

      let answer = "";
      try {
        const messages = [
          { role: "system" as const, content: SYSTEM_PROMPT },
          {
            role: "user" as const,
            content: buildUserPrompt({
              context: buildContext(chunks),
              question,
              maxChapter,
            }),
          },
        ];

        for await (const delta of streamChat(config, messages)) {
          answer += delta;
          controller.enqueue(line({ type: "delta", text: delta }));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "模型调用失败。";
        controller.enqueue(line({ type: "error", error: message }));
        controller.close();
        return;
      }

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: answer,
        reader_chapter_snapshot: maxChapter,
        citations_json: citations,
      });

      controller.enqueue(line({ type: "done" }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
