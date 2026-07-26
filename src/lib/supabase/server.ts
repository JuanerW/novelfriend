import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** 服务端组件、Server Action 和 Route Handler 用这个。 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // 服务端组件里不能写 cookie，交给 middleware 刷新 session。
          }
        },
      },
    },
  );
}

/**
 * 取当前登录用户，没有就返回 null。
 * 用 getUser() 而不是 getSession()，因为前者会向 Supabase 校验 JWT。
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
