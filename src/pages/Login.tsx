import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import loginBg from "@/assets/login-bg.jpg";
import { supabase } from "@/integrations/supabase/client";

const accountToEmail = (account: string) => `${account}@admin.local`;

// 仅在云端测试环境（Lovable 预览 / 本机开发）显示一键登录
const IS_TEST_ENV =
  (import.meta.env.VITE_SUPABASE_URL ?? "").includes("eceqokilpppnwtfzgbvq") &&
  /(lovable\.app|lovableproject\.com|localhost)$/.test(window.location.hostname);
const TEST_PASSWORD = "Test12345";
const TEST_ACCOUNTS = [
  { account: "test_student", label: "测试学生" },
  { account: "test_teacher", label: "测试老师" },
  { account: "test_admin", label: "测试管理员" },
  { account: "test_super", label: "测试超管" },
];

const Login = () => {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { account: "", password: "" },
  });

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const doSignIn = async (account: string, password: string) => {
    setSubmitting(true);
    const { error } = await signIn(accountToEmail(account), password);
    setSubmitting(false);
    if (error) {
      toast({
        title: "登录失败",
        description: "账号或密码错误，或该账号未被管理员导入。",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "登录成功" });
    navigate("/", { replace: true });
  };

  const onSubmit = async (values: LoginInput) => {
    await doSignIn(values.account, values.password);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-90 animate-bg-drift"
        style={{ backgroundImage: `url(${loginBg})` }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/30" />
      <div className="relative z-10 w-full flex items-center justify-center md:justify-end md:pr-20 lg:pr-32">
      <Card className="w-full max-w-md backdrop-blur-md bg-card/85 border-white/40 shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl">本科生创新实践学分认定系统</CardTitle>
          <CardDescription>请使用管理员分配的账号登录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="account">账号</Label>
              <Input
                id="account"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                placeholder="学号 / 工号 / 手机号"
                {...register("account")}
                aria-invalid={!!errors.account}
              />
              {errors.account && <p className="text-xs text-destructive">{errors.account.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
                aria-invalid={!!errors.password}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" variant="solid" className="w-full" disabled={submitting}>
              {submitting ? "登录中…" : "登录"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              账号由管理员统一导入，本系统不支持自助注册
            </p>
          </form>
          {IS_TEST_ENV && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-center text-xs text-muted-foreground">测试环境 · 一键登录（学校服务器上不显示）</p>
              <div className="grid grid-cols-2 gap-2">
                {TEST_ACCOUNTS.map((t) => (
                  <Button key={t.account} type="button" variant="outline" size="sm" disabled={submitting}
                    onClick={async () => {
                      setSubmitting(true);
                      const { error } = await supabase.functions.invoke("test-accounts");
                      setSubmitting(false);
                      if (error) { toast({ title: "测试账号准备失败", variant: "destructive" }); return; }
                      await doSignIn(t.account, TEST_PASSWORD);
                    }}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </main>
  );
};

export default Login;
