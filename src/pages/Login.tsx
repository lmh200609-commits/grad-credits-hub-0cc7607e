import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import loginBg from "@/assets/login-bg.jpg";

const accountToEmail = (account: string) => `${account}@admin.local`;

const TEST_ACCOUNTS = [
  { account: "2024001", label: "学生·白雪", role: "学生" },
  { account: "S2024101", label: "学生·赵子轩", role: "学生" },
  { account: "T001", label: "教师·张老师", role: "教师" },
  { account: "A001", label: "管理员", role: "管理员" },
] as const;
const TEST_PASSWORD = "Test1234";

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
          <CardTitle className="text-2xl">学分认证系统</CardTitle>
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
          <div className="space-y-2 border-t pt-4">
            <p className="text-center text-xs text-muted-foreground">测试账号（点击即可登录）</p>
            <div className="grid grid-cols-2 gap-2">
              {TEST_ACCOUNTS.map((t) => (
                <Button
                  key={t.account}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => void doSignIn(t.account, TEST_PASSWORD)}
                  className="flex flex-col h-auto py-2"
                >
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.account}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </main>
  );
};

export default Login;
