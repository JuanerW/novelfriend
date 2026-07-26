import AuthForm from "@/components/AuthForm";
import { login } from "@/app/auth/actions";

export const metadata = { title: "登录 · 无剧透小说助手" };

export default function LoginPage() {
  return <AuthForm mode="login" action={login} />;
}
