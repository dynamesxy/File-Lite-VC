import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/store/authStore";

export default function RegisterPage() {
  const { tx } = useI18n();
  const nav = useNavigate();
  const { user, loading, register } = useAuthStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      nav("/projects", { replace: true });
    }
  }, [nav, user]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (password !== confirmPassword) {
      setError(tx("两次输入的密码不一致", "The passwords do not match"));
      return;
    }
    setError(null);
    try {
      await register(username.trim(), password);
      nav("/projects", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("注册失败", "Registration failed"));
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="absolute right-4 top-4 w-[250px] rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="text-xs text-zinc-500">{tx("主题与语言", "Appearance & Language")}</div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="text-xs text-zinc-500">{tx("主题", "Theme")}</div>
          <div className="text-xs text-zinc-500">{tx("语言", "Language")}</div>
          <div className="flex justify-start">
            <ThemeToggle />
          </div>
          <div className="flex justify-start">
            <LanguageToggle />
          </div>
        </div>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-zinc-900">{tx("注册账号", "Create Account")}</div>
        <div className="mt-1 text-sm text-zinc-600">{tx("密码不做复杂度限制，注册成功后会自动登录。", "No password complexity rules are enforced. Successful registration signs you in automatically.")}</div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <div className="text-xs text-zinc-600">{tx("账号", "Username")}</div>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={tx("请输入账号", "Enter username")} autoFocus />
          </div>
          <div>
            <div className="text-xs text-zinc-600">{tx("密码", "Password")}</div>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tx("请输入密码", "Enter password")} type="password" />
          </div>
          <div>
            <div className="text-xs text-zinc-600">{tx("确认密码", "Confirm Password")}</div>
            <Input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={tx("请再次输入密码", "Enter password again")} type="password" />
          </div>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <Button className="w-full" disabled={loading || !username.trim() || !password || !confirmPassword} type="submit">
            {loading ? tx("注册中...", "Registering...") : tx("注册并登录", "Register and Sign In")}
          </Button>
        </form>

        <div className="mt-4 text-sm text-zinc-600">
          {tx("已有账号？", "Already have an account?")}{" "}
          <Link className="text-zinc-900 underline underline-offset-4" to="/login">
            {tx("去登录", "Sign In")}
          </Link>
        </div>
      </div>
    </div>
  );
}
