import { ReactNode, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation, matchPath } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCollegeTheme } from "@/hooks/useCollegeTheme";
import { usePreviewTheme } from "@/hooks/usePreviewTheme";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import AiAssistant from "@/components/AiAssistant";
import StaffAiAssistant from "@/components/StaffAiAssistant";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import {
  LayoutDashboard, Upload, BookOpen, ClipboardCheck, FileText, Library, LogOut,
  Users, BarChart3, Trophy, UserCog, Inbox, Send, ScrollText, Tags, History, Cpu, IdCard, GraduationCap,
  Activity, Palette, Building2, Shield, CalendarRange, ScanEye, FolderArchive,
} from "lucide-react";

type Item = { title: string; url: string; icon: typeof LayoutDashboard };

const adminItems: Item[] = [
  { title: "数据看板", url: "/admin/dashboard", icon: BarChart3 },
  { title: "复核中心", url: "/admin/review", icon: Inbox },
  { title: "全部审核", url: "/reviews", icon: ClipboardCheck },
  { title: "提交记录", url: "/submissions", icon: History },
  { title: "学分统计", url: "/admin/credits", icon: Trophy },
  { title: "规则库", url: "/admin/rules", icon: BookOpen },
  { title: "关键词库", url: "/admin/keywords", icon: Tags },
  { title: "案例库", url: "/admin/cases", icon: Library },
  { title: "赛事名录", url: "/admin/competitions", icon: Trophy },
  { title: "证书名录", url: "/admin/certificates", icon: IdCard },

  { title: "学生管理", url: "/admin/users/students", icon: Users },
  { title: "教师管理", url: "/admin/users/teachers", icon: UserCog },
  { title: "批量导入账号", url: "/admin/import", icon: Upload },
  { title: "审计日志", url: "/admin/audit-logs", icon: ScrollText },
  { title: "学院界面风格", url: "/admin/branding", icon: Palette },
  { title: "提交时间窗口", url: "/admin/submission-windows", icon: CalendarRange },
  { title: "材料导出", url: "/exports", icon: FolderArchive },
  { title: "实时一致性", url: "/diagnostics/realtime", icon: Activity },
];

const superAdminItems: Item[] = [
  { title: "学院管理", url: "/super/colleges", icon: Building2 },
  { title: "学院管理员", url: "/super/admins", icon: Shield },
  { title: "数据看板", url: "/admin/dashboard", icon: BarChart3 },
  { title: "复核中心", url: "/admin/review", icon: Inbox },
  { title: "全部审核", url: "/reviews", icon: ClipboardCheck },
  { title: "提交记录", url: "/submissions", icon: History },
  { title: "学分统计", url: "/admin/credits", icon: Trophy },
  { title: "规则库", url: "/admin/rules", icon: BookOpen },
  { title: "关键词库", url: "/admin/keywords", icon: Tags },
  { title: "案例库", url: "/admin/cases", icon: Library },
  { title: "赛事名录", url: "/admin/competitions", icon: Trophy },
  { title: "证书名录", url: "/admin/certificates", icon: IdCard },

  { title: "学生管理", url: "/admin/users/students", icon: Users },
  { title: "教师管理", url: "/admin/users/teachers", icon: UserCog },
  { title: "批量导入账号", url: "/admin/import", icon: Upload },
  { title: "AI 模型设置", url: "/admin/ai-models", icon: Cpu },
  { title: "AIGC 图像鉴别", url: "/admin/aigc", icon: ScanEye },
  { title: "审计日志", url: "/admin/audit-logs", icon: ScrollText },
  { title: "提交时间窗口", url: "/admin/submission-windows", icon: CalendarRange },
  { title: "材料导出", url: "/exports", icon: FolderArchive },
  { title: "实时一致性", url: "/diagnostics/realtime", icon: Activity },
];

const teacherItems: Item[] = [
  { title: "数据看板", url: "/teacher/dashboard", icon: BarChart3 },
  { title: "待审核", url: "/reviews", icon: ClipboardCheck },
  { title: "提交记录", url: "/submissions", icon: History },
  { title: "学分统计", url: "/teacher/credits", icon: Trophy },
  { title: "班级学分", url: "/teacher/classes", icon: GraduationCap },
  { title: "学生管理", url: "/teacher/students", icon: Users },
  { title: "材料导出", url: "/exports", icon: FolderArchive },
  { title: "实时一致性", url: "/diagnostics/realtime", icon: Activity },
];

const studentItems: Item[] = [
  { title: "工作台", url: "/", icon: LayoutDashboard },
  { title: "申请学分", url: "/apply", icon: Send },
  { title: "我的申请", url: "/my-applications", icon: FileText },
  { title: "我的档案", url: "/profile", icon: IdCard },
];

// Extra routes (detail pages, shared routes) for header title lookup only
const extraTitles: { pattern: string; title: string }[] = [
  { pattern: "/applications/:id", title: "申请详情" },
  { pattern: "/admin/users/students/:id", title: "学生详情" },
  { pattern: "/admin/users/teachers/:id", title: "教师详情" },
  { pattern: "/teacher/students/:id", title: "学生详情" },
];

const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { hasRole, isSuperAdmin, collegeId } = useAuth();
  const { active: previewActive, roleView } = usePreviewTheme();
  const location = useLocation();
  const college = useCollegeTheme();
  const effectiveRole: "super_admin" | "admin" | "teacher" | "student" =
    previewActive && roleView
      ? roleView
      : isSuperAdmin ? "super_admin"
      : hasRole("admin") ? "admin"
      : hasRole("teacher") ? "teacher"
      : "student";
  const items =
    effectiveRole === "super_admin" ? superAdminItems
    : effectiveRole === "admin" ? adminItems
    : effectiveRole === "teacher" ? teacherItems
    : studentItems;

  const isItemActive = (url: string) =>
    url === "/"
      ? location.pathname === "/"
      : location.pathname === url || location.pathname.startsWith(url + "/");

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 每个 collegeId 维护独立的滚动位置；切换学院（或登出再登录到不同学院）时不互相串扰
    const storageKey = `sidebar-scroll-top:${collegeId ?? "_none"}`;
    const saved = Number(sessionStorage.getItem(storageKey) || "0");
    el.scrollTop = saved > 0 ? saved : 0;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sessionStorage.setItem(storageKey, String(el.scrollTop));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [collegeId]);

  return (
    <Sidebar collapsible="icon">
      {/* College brand banner — fixed at top, does not scroll with nav list */}
      <div
        className={`flex shrink-0 items-center gap-3 border-b px-3 py-3 ${collapsed ? "justify-center px-2" : ""}`}
        style={{
          backgroundImage:
            "linear-gradient(135deg, hsl(var(--brand-strong)) 0%, hsl(var(--primary)) 100%)",
          borderBottomColor: "hsl(var(--primary) / 0.4)",
        }}
      >
        {college?.badge_url ? (
          <img
            key={college.badge_url}
            src={college.badge_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full bg-background object-contain p-0.5 ring-2 ring-white/60"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white ring-2 ring-white/40">
            {(college?.short_name || college?.name || "学").slice(0, 1)}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight text-white">
            <div className="truncate text-sm font-semibold">
              {college?.short_name || college?.name || "本科生创新实践学分认定系统"}
            </div>
            <div className="truncate text-[11px] text-white/75">本科生创新实践学分认定系统</div>
          </div>
        )}
      </div>
      <SidebarContent ref={scrollRef}>
        <SidebarGroup>
          <SidebarGroupLabel style={{ color: "hsl(var(--brand-strong))" }}>
            导航
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((it) => {
                const active = isItemActive(it.url);
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild tooltip={it.title}>
                      <SidebarNavItem url={it.url} active={active} collapsed={collapsed} icon={it.icon} title={it.title} />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

const SidebarNavItem = ({
  url, active, collapsed, icon: Icon, title,
}: { url: string; active: boolean; collapsed: boolean; icon: typeof LayoutDashboard; title: string }) => {
  const ref = useRef<HTMLAnchorElement>(null);
  return (
    <NavLink
      ref={ref}
      to={url}
      end={url === "/"}
      className={
        `relative flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
          active
            ? "font-semibold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r"
            : "hover:bg-muted/60"
        }`
      }
      style={
        active
          ? {
              backgroundColor: "hsl(var(--brand-strong) / 0.12)",
              color: "hsl(var(--brand-strong))",
            }
          : undefined
      }
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
          style={{ backgroundColor: "hsl(var(--brand-strong))" }}
        />
      )}
      <Icon
        className="h-4 w-4 shrink-0"
        strokeWidth={active ? 2.25 : 1.75}
      />
      {!collapsed && <span className="truncate">{title}</span>}
    </NavLink>
  );
};

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, roles, signOut, hasRole, isSuperAdmin } = useAuth();
  const college = useCollegeTheme();
  const { active: previewActive, roleView } = usePreviewTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };
  const collegeShort = college?.short_name || college?.name || "";
  const realLabel = roles.includes("super_admin") ? "超级管理员"
    : roles.includes("admin") ? (collegeShort ? `${collegeShort}管理员` : "学院管理员")
    : roles.includes("teacher") ? (collegeShort ? `${collegeShort}教师` : "教师")
    : roles.includes("student") ? (collegeShort ? `${collegeShort}学生` : "学生")
    : "未分配";
  const previewLabel = roleView === "admin" ? "管理员" : roleView === "teacher" ? "教师" : roleView === "student" ? "学生" : "";
  const roleLabel = previewActive && roleView ? `预览：${previewLabel}视角` : realLabel;
  const showStudentAssistant = previewActive && roleView ? roleView === "student" : hasRole("student");
  const showStaffAssistant = previewActive && roleView
    ? (roleView === "admin" || roleView === "teacher")
    : (isSuperAdmin || hasRole("admin") || hasRole("teacher"));

  const allMenuItems = [...superAdminItems, ...adminItems, ...teacherItems, ...studentItems];
  const currentTitle =
    allMenuItems.find((it) =>
      it.url === "/"
        ? location.pathname === "/"
        : location.pathname === it.url || location.pathname.startsWith(it.url + "/"),
    )?.title ??
    extraTitles.find((e) => matchPath({ path: e.pattern, end: true }, location.pathname))?.title ??
    "";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header
            className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b-2 px-3 sm:px-4"
            style={{
              backgroundColor: "hsl(var(--header-tint))",
              borderBottomColor: "hsl(var(--primary) / 0.35)",
            }}
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <SidebarTrigger />
              {college?.badge_url && (
                <img
                  key={college.badge_url}
                  src={college.badge_url}
                  alt=""
                  className="h-9 w-9 rounded-full bg-background object-contain p-0.5 ring-2 ring-primary/40"
                />
              )}
              <span
                className="truncate font-semibold"
                style={{ color: "hsl(var(--brand-strong))" }}
              >
                {college?.system_title ?? "本科生创新实践学分认定系统"}
              </span>
              {currentTitle && (
                <>
                  <span className="hidden text-muted-foreground sm:inline">·</span>
                  <span className="hidden truncate text-sm text-muted-foreground sm:inline">
                    {currentTitle}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden max-w-[40vw] truncate text-muted-foreground md:inline">
                {roleLabel}
              </span>
              <ChangePasswordDialog />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">退出</span>
              </Button>
            </div>
          </header>
          <main
            className="flex-1 overflow-auto p-3 sm:p-6"
            style={{
              backgroundImage:
                "linear-gradient(180deg, hsl(var(--header-tint) / 0.45) 0%, hsl(var(--background)) 220px)",
            }}
          >
            {children}
          </main>
        </div>
        {showStudentAssistant && <AiAssistant />}
        {showStaffAssistant && <StaffAiAssistant />}
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
