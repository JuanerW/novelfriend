import AuthForm from "@/components/AuthForm";
import { register } from "@/app/auth/actions";

export const metadata = { title: "注册 · 无剧透小说助手" };

export default function RegisterPage() {
  return <AuthForm mode="register" action={register} />;
}
