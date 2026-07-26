import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto";
import { testConnection } from "@/lib/llm/client";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 测试连接。
 * 表单里填了 apiKey 就用填的（还没保存也能测），否则用已存的。
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json().catch(() => null);

  const baseUrl = String(body?.baseUrl ?? "").trim();
  const chatModel = String(body?.chatModel ?? "").trim();
  const embeddingModel = String(body?.embeddingModel ?? "").trim();
  let apiKey = String(body?.apiKey ?? "").trim();

  if (!baseUrl || !chatModel || !embeddingModel) {
    return NextResponse.json(
      { error: "请先填写 Base URL 和两个模型名。" },
      { status: 400 },
    );
  }

  if (!apiKey) {
    const { data } = await supabase
      .from("provider_settings")
      .select("encrypted_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json(
        { error: "还没有保存过 API Key，请先填写。" },
        { status: 400 },
      );
    }

    try {
      apiKey = decryptApiKey(data.encrypted_api_key);
    } catch {
      return NextResponse.json(
        { error: "已保存的 API Key 解密失败，请重新填写。" },
        { status: 500 },
      );
    }
  }

  const result = await testConnection({
    baseUrl,
    apiKey,
    chatModel,
    embeddingModel,
  });

  // 数据库里 embedding 列是 vector(1536)，维度对不上得提醒
  const dimensionWarning =
    result.embeddingDimensions && result.embeddingDimensions !== 1536
      ? `注意：该 Embedding 模型输出 ${result.embeddingDimensions} 维，` +
        `而数据库的 chunks.embedding 是 vector(1536)。` +
        `需要把 migration 里的维度改成 ${result.embeddingDimensions} 再重建索引。`
      : undefined;

  return NextResponse.json({ ...result, dimensionWarning });
}
