import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // RLS 已经限定了 user_id，这里再显式过滤一次
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, status, error_message, chapter_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: `读取书架失败：${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ books: data });
}
