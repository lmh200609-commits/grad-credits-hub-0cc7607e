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
import loginBg from "@/assets/login-bg.jpg";

const accountToEmail = (account: string) => `${account}@admin.local`;

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
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden overflow-hidden lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center animate-bg-drift"
          style={{ backgroundImage: `url(${loginBg})` }}
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-transparent" />
        <div className="relative z-10 flex h-full flex-col justify-end p-12 text-background">
          <p className="mb-3 text-sm tracking-[0.3em] opacity-80">CREDIT CERTIFICATION</p>
          <h2 className="text-4xl font-bold leading-tight">创新实践学分<br />认定与管理平台</h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed opacity-85">
            在线提交申请表与佐证材料，教师审核、学分统计、材料归档一站完成。
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <div className="h-1 w-10 rounded-full bg-primary" />
            <h1 className="text-3xl font-bold tracking-tight">欢迎登录</h1>
            <p className="text-sm text-muted-foreground">学分认证系统 · 请使用管理员分配的账号</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="account">账号</Label>
              <Input
                id="account"
                type="text"
                autoComplete="username"
                placeholder="学号 / 工号"
                className="h-11"
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
                placeholder="请输入密码"
                className="h-11"
                {...register("password")}
                aria-invalid={!!errors.password}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" variant="solid" className="h-11 w-full text-base" disabled={submitting}>
              {submitting ? "登录中…" : "登 录"}
            </Button>
          </form>

          <p className="border-t pt-6 text-center text-xs text-muted-foreground">
            账号由管理员统一导入，不支持自助注册；忘记密码请联系老师重置
          </p>
        </div>
      </section>
    </main>
  );
};

export default Login;
