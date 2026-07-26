import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptApiKey, maskApiKey } from "@/lib/crypto";
import { normalizeBaseUrl } from "@/lib/llm/client";

export const runtime = "nodejs";

/** 读取当前配置。永远不返回完整 API Key。 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { data } = await supabase
    .from("provider_settings")
    .select("base_url, chat_model, embedding_model, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ settings: data ?? null });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json().catch(() => null);

  const baseUrl = String(body?.baseUrl ?? "").trim();
  const apiKey = String(body?.apiKey ?? "").trim();
  const chatModel = String(body?.chatModel ?? "").trim();
  const embeddingModel = String(body?.embeddingModel ?? "").trim();

  if (!baseUrl || !chatModel || !embeddingModel) {
    return NextResponse.json(
      { error: "Base URL、Chat Model 和 Embedding Model 都不能为空。" },
      { status: 400 },
    );
  }

  if (!/^https?:\/\//i.test(baseUrl)) {
    return NextResponse.json(
      { error: "Base URL 必须以 http:// 或 https:// 开头。" },
      { status: 400 },
    );
  }

  // 允许只改模型不改 Key：apiKey 留空就沿用已存的
  const { data: existing } = await supabase
    .from("provider_settings")
    .select("encrypted_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!apiKey && !existing) {
    return NextResponse.json({ error: "请填写 API Key。" }, { status: 400 });
  }

  let encrypted: string;
  try {
    encrypted = apiKey
      ? encryptApiKey(apiKey)
      : existing!.encrypted_api_key;
  } catch (e) {
    // 多半是 API_KEY_ENCRYPTION_SECRET 没配好
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "加密失败。" },
      { status: 500 },
    );
  }

  const { error } = await supabase.from("provider_settings").upsert(
    {
      user_id: user.id,
      base_url: normalizeBaseUrl(baseUrl),
      encrypted_api_key: encrypted,
      chat_model: chatModel,
      embedding_model: embeddingModel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: "保存失败。" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    maskedApiKey: apiKey ? maskApiKey(apiKey) : undefined,
  });
}

/** 删除配置——对应「用户可以删除 API Key」。 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { error } = await supabase
    .from("provider_settings")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "删除失败。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
