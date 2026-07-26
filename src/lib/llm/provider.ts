import "server-only";

import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto";
import type { ProviderConfig } from "@/lib/llm/client";

/**
 * 读取当前用户的 LLM 配置并解密 API Key。
 * 只在服务端调用，返回值绝不能进响应体。
 */
export async function loadProviderConfig(
  userId: string,
): Promise<ProviderConfig | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("provider_settings")
    .select("base_url, encrypted_api_key, chat_model, embedding_model")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    baseUrl: data.base_url,
    apiKey: decryptApiKey(data.encrypted_api_key),
    chatModel: data.chat_model,
    embeddingModel: data.embedding_model,
  };
}
