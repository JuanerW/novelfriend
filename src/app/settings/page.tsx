import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/SettingsForm";

export const metadata = { title: "设置 · 无剧透小说助手" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 注意只 select 非敏感列，encrypted_api_key 不进页面
  const { data: saved } = await supabase
    .from("provider_settings")
    .select("base_url, chat_model, embedding_model")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/library"
        className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
      >
        ← 书架
      </Link>

      <h1 className="mt-2 mb-1 text-2xl font-semibold">设置</h1>
      <p className="mb-8 text-sm text-neutral-500">
        填写你自己的 OpenAI-compatible API，用于生成向量和回答问题。
      </p>

      <SettingsForm saved={saved ?? null} />
    </main>
  );
}
