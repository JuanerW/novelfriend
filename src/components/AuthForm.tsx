"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthState } from "@/app/auth/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {pending ? "处理中…" : label}
    </button>
  );
}

type Props = {
  mode: "login" | "register";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
};

export default function AuthForm({ mode, action }: Props) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, {
    error: null,
  });

  const isLogin = mode === "login";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold">
        {isLogin ? "登录" : "注册"}
      </h1>
      <p className="mb-6 text-sm text-neutral-500">无剧透小说助手</p>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm">
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-300"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={6}
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-300"
          />
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}

        <SubmitButton label={isLogin ? "登录" : "注册"} />
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        {isLogin ? "还没有账号？" : "已经有账号？"}{" "}
        <Link
          href={isLogin ? "/register" : "/login"}
          className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-200"
        >
          {isLogin ? "注册" : "登录"}
        </Link>
      </p>
    </div>
  );
}
