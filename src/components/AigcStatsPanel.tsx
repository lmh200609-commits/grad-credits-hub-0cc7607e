import { deserializeItems } from "@/lib/parseForm";
import { applicationDescription } from "@/lib/applicationDisplay";
import { displayError } from "@/lib/displayText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Download, FileText, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { handleAuthExpired } from "@/lib/sessionGuard";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toastErrorLegacy } from "@/lib/errors";

type Row = {
  id: string;
  aigc_status: "pending" | "real" | "suspect" | "fake" | "skipped" | "error";
  aigc_score: number | null;
  submitted_at: string;
  college_id: string | null;
  description: string | null;
  student_id?: string | null;
};

type ProfileLite = {
  user_id: string;
  full_name: string | null;
  student_no: string | null;
  department: string | null;
  class_name: string | null;
  major: string | null;
  advisor: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  college_id: string | null;
};

const STATUS_LABELS: Record<Row["aigc_status"], string> = {
  fake: "高风险",
  suspect: "嫌疑",
  real: "通过",
  pending: "待检测",
  skipped: "跳过",
  error: "失败",
};

const STATUS_COLOR: Record<Row["aigc_status"], string> = {
  fake: "hsl(var(--destructive))",
  suspect: "hsl(var(--warning))",
  real: "hsl(var(--success))",
  pending: "hsl(var(--muted-foreground))",
  skipped: "hsl(var(--muted-foreground) / 0.6)",
  error: "hsl(var(--info))",
};

const ALL_STATUSES: Row["aigc_status"][] = ["fake", "suspect", "real", "pending", "skipped", "error"];

const RANGES: { v: string; label: string; days: number | null }[] = [
  { v: "7", label: "近 7 天", days: 7 },
  { v: "14", label: "近 14 天", days: 14 },
  { v: "30", label: "近 30 天", days: 30 },
  { v: "90", label: "近 90 天", days: 90 },
  { v: "all", label: "全部", days: null },
];

function fmtDate(d: Date) {
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AigcStatsPanel() {
  const { collegeId, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<string>("14");
  const [statuses, setStatuses] = useState<Row["aigc_status"][]>([...ALL_STATUSES]);
  const [collegeFilter, setCollegeFilter] = useState<string>("all"); // 仅超管
  const [colleges, setColleges] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [dayFocus, setDayFocus] = useState<string | null>(null);
  const [pieFocus, setPieFocus] = useState<Row["aigc_status"] | null>(null);
  const [errReasons, setErrReasons] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // 学院列表（用于报告里展示"学院"列；所有认证用户均可读 colleges）
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("colleges").select("id, name").eq("active", true).order("name");
      setColleges((data ?? []) as any);
    })();
  }, []);

  const sinceIso = useMemo(() => {
    const r = RANGES.find((x) => x.v === range);
    if (!r?.days) return null;
    const d = new Date();
    d.setDate(d.getDate() - r.days);
    return d.toISOString();
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("applications")
      .select("id, aigc_status, aigc_score, submitted_at, college_id, description, student_id")
      .order("submitted_at", { ascending: false })
      .limit(2000);
    if (sinceIso) q = q.gte("submitted_at", sinceIso);
    if (isSuperAdmin && collegeFilter !== "all") q = q.eq("college_id", collegeFilter);
    const { data, error } = await q;
    if (error) {
      if (await handleAuthExpired(error)) {
        setLoading(false);
        return;
      }
      toastErrorLegacy(error, "加载 AI 鉴别数据失败");
    } else {
      const list = (data ?? []) as Row[];
      setRows(list);
      const errIds = list.filter((r) => r.aigc_status === "error").map((r) => r.id);
      if (errIds.length) {
        const { data: q } = await supabase.from("aigc_detect_queue").select("application_id, last_error, attempts").in("application_id", errIds);
        const m = new Map<string, string>();
        for (const it of (q ?? []) as { application_id: string; last_error: string | null; attempts: number }[]) {
          const raw = it.last_error ?? "";
          const zh = raw ? displayError(raw) : "未记录原因";
          m.set(it.application_id, `${zh}（已尝试 ${it.attempts} 次）`);
        }
        setErrReasons(m);
      } else setErrReasons(new Map());
      const ids = Array.from(new Set(list.map((r) => r.student_id).filter(Boolean) as string[]));
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("user_id, full_name, student_no, department, class_name, major, advisor, phone, email, gender, college_id")
          .in("user_id", ids);
        const m = new Map<string, ProfileLite>();
        (ps ?? []).forEach((p: any) => m.set(p.user_id, p));
        setProfiles(m);
      } else {
        setProfiles(new Map());
      }
    }
    setLoading(false);
  }, [sinceIso, isSuperAdmin, collegeFilter]);

  const reload = useSerializedReload(load);
  useEffect(() => { reload(); }, [reload, load]);

  const realtimeFilter = isSuperAdmin
    ? undefined
    : (collegeId ? `college_id=eq.${collegeId}` : null);
  useRealtimeTable("applications", reload, { filter: realtimeFilter });

  // 应用状态筛选
  const filtered = useMemo(
    () => rows.filter((r) => statuses.includes(r.aigc_status)),
    [rows, statuses],
  );

  // KPI
  const kpi = useMemo(() => {
    const checked = filtered.filter((r) => ["real", "suspect", "fake"].includes(r.aigc_status));
    const fake = filtered.filter((r) => r.aigc_status === "fake").length;
    const suspect = filtered.filter((r) => r.aigc_status === "suspect").length;
    const pending = filtered.filter((r) => r.aigc_status === "pending").length;
    const checkedN = checked.length;
    const detected = fake + suspect;
    const detectRate = checkedN ? (detected / checkedN) * 100 : 0;
    const scored = filtered.filter((r) => typeof r.aigc_score === "number");
    const avgScore = scored.length
      ? (scored.reduce((s, r) => s + (r.aigc_score ?? 0), 0) / scored.length) * 100
      : 0;
    return { checked: checkedN, fake, suspect, pending, detectRate, avgScore };
  }, [filtered]);

  // 柱状图：按天聚合 fake / suspect / real
  const barData = useMemo(() => {
    const days = RANGES.find((x) => x.v === range)?.days ?? 30;
    const map = new Map<string, { date: string; fake: number; suspect: number; real: number }>();
    if (RANGES.find((x) => x.v === range)?.days) {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        map.set(fmtDay(d), { date: fmtDate(d), fake: 0, suspect: 0, real: 0 });
      }
    }
    for (const r of filtered) {
      const d = new Date(r.submitted_at);
      const key = fmtDay(d);
      if (!map.has(key)) {
        map.set(key, { date: fmtDate(d), fake: 0, suspect: 0, real: 0 });
      }
      const slot = map.get(key)!;
      if (r.aigc_status === "fake") slot.fake++;
      else if (r.aigc_status === "suspect") slot.suspect++;
      else if (r.aigc_status === "real") slot.real++;
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, v]) => v);
  }, [filtered, range]);

  // 饼图：状态分布
  const piePartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) counts[r.aigc_status] = (counts[r.aigc_status] ?? 0) + 1;
    return ALL_STATUSES
      .filter((s) => counts[s])
      .map((s) => ({ name: STATUS_LABELS[s], value: counts[s], status: s }));
  }, [filtered]);

  // Top 20 高风险（可叠加按日聚焦过滤）
  const topRisky = useMemo(() => {
    let list = pieFocus
      ? filtered.filter((r) => r.aigc_status === pieFocus)
      : filtered.filter((r) => r.aigc_status === "fake" || r.aigc_status === "suspect");
    if (dayFocus) {
      list = list.filter((r) => fmtDate(new Date(r.submitted_at)) === dayFocus);
    }
    return list
      .sort((a, b) => (b.aigc_score ?? 0) - (a.aigc_score ?? 0))
      .slice(0, 20);
  }, [filtered, dayFocus, pieFocus]);

  const scopeLabel = isSuperAdmin
    ? (collegeFilter === "all" ? "全校" : (colleges.find((c) => c.id === collegeFilter)?.name ?? "—"))
    : "本学院";
  const rangeLabel = RANGES.find((x) => x.v === range)?.label ?? "";

  const collegeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    colleges.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [colleges]);

  // 报告专用：学生级聚合 + 班级级聚合（仅基于已加载 filtered 数据）
  type StudentAgg = {
    student_id: string;
    profile: ProfileLite | null;
    college_name: string;
    class_key: string; // 用于分组：学院|班级
    class_label: string;
    fake: number;
    suspect: number;
    real: number;
    pending: number;
    maxScore: number;
    lastSubmittedAt: string | null;
    items: Row[]; // 该学生在范围内的全部申请
  };

  const { studentAggs, classAggs, orphanRows } = useMemo(() => {
    const studMap = new Map<string, StudentAgg>();
    const orphans: Row[] = [];
    for (const r of filtered) {
      const sid = r.student_id || "";
      if (!sid) {
        orphans.push(r);
        continue;
      }
      const p = profiles.get(sid) || null;
      if (!p) {
        orphans.push(r);
        continue;
      }
      const collegeName = collegeNameMap.get(p.college_id || r.college_id || "") || "未设置学院";
      const className = (p.class_name || "").trim() || "未填写班级";
      const class_key = `${collegeName}||${className}`;
      let agg = studMap.get(sid);
      if (!agg) {
        agg = {
          student_id: sid,
          profile: p,
          college_name: collegeName,
          class_key,
          class_label: className,
          fake: 0, suspect: 0, real: 0, pending: 0,
          maxScore: 0,
          lastSubmittedAt: null,
          items: [],
        };
        studMap.set(sid, agg);
      }
      agg.items.push(r);
      if (r.aigc_status === "fake") agg.fake++;
      else if (r.aigc_status === "suspect") agg.suspect++;
      else if (r.aigc_status === "real") agg.real++;
      else if (r.aigc_status === "pending") agg.pending++;
      if (typeof r.aigc_score === "number" && r.aigc_score > agg.maxScore) agg.maxScore = r.aigc_score;
      if (!agg.lastSubmittedAt || r.submitted_at > agg.lastSubmittedAt) agg.lastSubmittedAt = r.submitted_at;
    }
    const studentAggs = Array.from(studMap.values()).sort(
      (a, b) => b.fake - a.fake || b.suspect - a.suspect || b.maxScore - a.maxScore,
    );

    type ClassAgg = {
      key: string;
      college_name: string;
      class_label: string;
      advisor: string;
      students: number;
      fake: number;
      suspect: number;
      real: number;
      pending: number;
      total: number;
    };
    const cMap = new Map<string, ClassAgg>();
    for (const s of studentAggs) {
      let c = cMap.get(s.class_key);
      if (!c) {
        c = {
          key: s.class_key,
          college_name: s.college_name,
          class_label: s.class_label,
          advisor: s.profile?.advisor || "",
          students: 0, fake: 0, suspect: 0, real: 0, pending: 0, total: 0,
        };
        cMap.set(s.class_key, c);
      }
      c.students++;
      c.fake += s.fake;
      c.suspect += s.suspect;
      c.real += s.real;
      c.pending += s.pending;
      c.total += s.items.length;
      if (!c.advisor && s.profile?.advisor) c.advisor = s.profile.advisor;
    }
    const classAggs = Array.from(cMap.values()).sort(
      (a, b) => b.fake - a.fake || b.suspect - a.suspect || b.total - a.total,
    );
    return { studentAggs, classAggs, orphanRows: orphans };
  }, [filtered, profiles, collegeNameMap]);

  const summaryCounts = useMemo(() => ({
    students: studentAggs.length,
    classes: classAggs.length,
    colleges: new Set(studentAggs.map((s) => s.college_name)).size,
  }), [studentAggs, classAggs]);

  // 章节三：仅展示有 fake/suspect 的学生，按班级分组（保持顺序）
  const groupedRiskyStudents = useMemo(() => {
    const risky = studentAggs.filter((s) => s.fake > 0 || s.suspect > 0);
    const truncated = risky.length > 200 ? risky.slice(0, 200) : risky;
    const groups = new Map<string, { college_name: string; class_label: string; advisor: string; majors: Set<string>; students: StudentAgg[] }>();
    for (const s of truncated) {
      let g = groups.get(s.class_key);
      if (!g) {
        g = {
          college_name: s.college_name,
          class_label: s.class_label,
          advisor: s.profile?.advisor || "",
          majors: new Set<string>(),
          students: [],
        };
        groups.set(s.class_key, g);
      }
      if (s.profile?.major) g.majors.add(s.profile.major);
      if (!g.advisor && s.profile?.advisor) g.advisor = s.profile.advisor;
      g.students.push(s);
    }
    return { groups: Array.from(groups.values()), truncatedFrom: risky.length > 200 ? risky.length : null };
  }, [studentAggs]);

  const exportCsv = () => {
    const header = ["申请ID", "提交时间", "AI状态", "AI概率(%)", "申请描述", "学院ID"];
    const lines = filtered.map((r) => [
      r.id,
      new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false }),
      STATUS_LABELS[r.aigc_status],
      typeof r.aigc_score === "number" ? (r.aigc_score * 100).toFixed(1) : "",
      applicationDescription(r.description, true).slice(0, 40).replace(/[\r\n]+/g, " "),
      r.college_id ?? "",
    ]);
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [header, ...lines].map((row) => row.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `AIGC统计_${scopeLabel}_${rangeLabel}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    if (!reportRef.current) return;
    setExportingPdf(true);
    try {
      // 等一帧让隐藏 DOM 完成布局/图表渲染
      await new Promise((r) => setTimeout(r, 250));
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(dataUrl, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      let pageNo = 1;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(dataUrl, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
        pageNo++;
      }
      // 页脚 页码
      const totalPages = pageNo;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(120);
        pdf.text(`第 ${i} / ${totalPages} 页`, pageW - 25, pageH - 6);
      }
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      pdf.save(`AIGC统计报告_${scopeLabel}_${rangeLabel}_${ts}.pdf`);
    } catch (e: any) {
      toastErrorLegacy(e, "导出 PDF 失败");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <CardTitle className="text-base">AI 生成材料鉴别</CardTitle>
          <Badge variant="outline" className="text-xs">{filtered.length} 条</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={loading || exportingPdf || filtered.length === 0}>
            {exportingPdf ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
            {exportingPdf ? "生成中…" : "PDF"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 筛选 */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">时间</span>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">状态</span>
            <ToggleGroup
              type="multiple"
              size="sm"
              value={statuses}
              onValueChange={(v) => setStatuses((v as Row["aigc_status"][]).length ? (v as any) : [...ALL_STATUSES])}
              className="flex-wrap"
            >
              {ALL_STATUSES.map((s) => (
                <ToggleGroupItem key={s} value={s} className="h-7 px-2 text-xs">
                  {STATUS_LABELS[s]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">学院</span>
              <SearchableSelect
                value={collegeFilter}
                onChange={setCollegeFilter}
                options={[
                  { value: "all", label: "全部学院" },
                  ...colleges.map((c) => ({ value: c.id, label: c.name })),
                ]}
                placeholder="全部学院"
                searchPlaceholder="搜索学院…"
                className="h-8 w-[160px]"
              />
            </div>
          )}
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kpi label="已检测" value={kpi.checked} />
          <Kpi
            label="高风险"
            value={kpi.fake}
            accent="text-destructive"
            onClick={() => setStatuses(["fake"])}
          />
          <Kpi
            label="嫌疑"
            value={kpi.suspect}
            accent="text-warning"
            onClick={() => setStatuses(["suspect"])}
          />
          <Kpi label="检出率" value={`${kpi.detectRate.toFixed(1)}%`} accent={kpi.detectRate > 5 ? "text-destructive" : "text-foreground"} />
          <Kpi label="平均概率" value={`${kpi.avgScore.toFixed(1)}%`} />
        </div>

        {kpi.pending > 0 && (
          <div className="flex items-center justify-between rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              当前范围内有 <span className="font-semibold text-foreground">{kpi.pending}</span> 条待检测申请（多为 AI 文本审驳回或无图片，未跑过图像鉴别）
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatuses(["pending"])}
              disabled={statuses.length === 1 && statuses[0] === "pending"}
            >
              仅看待检测
            </Button>
          </div>
        )}

        {/* 图表 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[260px]">
            {barData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  onClick={(s: any) => {
                    if (s?.activeLabel) setDayFocus(String(s.activeLabel));
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis allowDecimals={false} className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="real" name="通过" stackId="a" fill={STATUS_COLOR.real} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="suspect" name="嫌疑" stackId="a" fill={STATUS_COLOR.suspect} />
                  <Bar dataKey="fake" name="高风险" stackId="a" fill={STATUS_COLOR.fake} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="h-[260px]">
            {piePartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={piePartData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    label
                    onClick={(d: any) => {
                      const s = d?.payload?.status as Row["aigc_status"] | undefined;
                      if (s) { setPieFocus(s); setDayFocus(null); setTimeout(() => document.getElementById("aigc-detail-list")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {piePartData.map((d, i) => (
                      <Cell key={i} fill={STATUS_COLOR[d.status as Row["aigc_status"]]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 高风险 / 嫌疑 申请清单 —— 可点击跳转 */}
        <RiskyTable
          rows={topRisky}
          profiles={profiles}
          dayFocus={dayFocus}
          pieFocus={pieFocus ? STATUS_LABELS[pieFocus] : null}
          errReasons={errReasons}
          onClearFocus={() => { setDayFocus(null); setPieFocus(null); }}
          onRowClick={(id) => navigate(`/applications/${id}`)}
        />

        {/* 隐藏的 PDF 报告 DOM —— 截屏专用 */}
        <div className="pointer-events-none fixed -left-[10000px] top-0 -z-10" aria-hidden>
          <div
            ref={reportRef}
            style={{ width: 794, padding: 32, background: "#fff", color: "#0f172a", fontFamily: "system-ui, sans-serif" }}
          >
            <div style={{ borderBottom: "2px solid #0f172a", paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>AI 生成材料鉴别报告</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#475569" }}>
                范围：{scopeLabel} · {rangeLabel} · 状态筛选：{statuses.map((s) => STATUS_LABELS[s]).join(" / ")} · 生成于 {new Date().toLocaleString("zh-CN", { hour12: false })}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#475569" }}>
                覆盖学生 <b>{summaryCounts.students}</b> 人 · 涉及班级 <b>{summaryCounts.classes}</b> 个 · 涉及学院 <b>{summaryCounts.colleges}</b> 个 · 申请条数 <b>{filtered.length}</b>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { l: "已检测", v: kpi.checked, c: "#0f172a" },
                { l: "高风险", v: kpi.fake, c: "#b91c1c" },
                { l: "嫌疑", v: kpi.suspect, c: "#b45309" },
                { l: "检出率", v: `${kpi.detectRate.toFixed(1)}%`, c: kpi.detectRate > 5 ? "#b91c1c" : "#0f172a" },
                { l: "平均概率", v: `${kpi.avgScore.toFixed(1)}%`, c: "#0f172a" },
              ].map((k, i) => (
                <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{k.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: k.c, marginTop: 4 }}>{k.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>每日鉴别趋势</div>
                <div style={{ width: "100%", height: 220, background: "#fff" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#475569" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#475569" />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="real" name="通过" stackId="a" fill="#10b981" />
                      <Bar dataKey="suspect" name="嫌疑" stackId="a" fill="#f59e0b" />
                      <Bar dataKey="fake" name="高风险" stackId="a" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>状态分布</div>
                <div style={{ width: "100%", height: 220, background: "#fff" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={piePartData} dataKey="value" nameKey="name" outerRadius={80} label={{ fontSize: 10 }}>
                        {piePartData.map((d, i) => {
                          const map: Record<string, string> = {
                            fake: "#ef4444", suspect: "#f59e0b", real: "#10b981",
                            pending: "#94a3b8", skipped: "#cbd5e1", error: "#3b82f6",
                          };
                          return <Cell key={i} fill={map[d.status]} />;
                        })}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Top {topRisky.length} 高风险申请明细
              </div>
              {topRisky.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>当前范围内无高风险或嫌疑申请。</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={th}>#</th>
                      <th style={th}>提交时间</th>
                      <th style={th}>状态</th>
                      <th style={th}>AI 概率</th>
                      <th style={{ ...th, textAlign: "left" }}>申请描述</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRisky.map((r, i) => (
                      <tr key={r.id}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}>{new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false })}</td>
                        <td style={{ ...td, color: r.aigc_status === "fake" ? "#b91c1c" : "#b45309", fontWeight: 600 }}>
                          {STATUS_LABELS[r.aigc_status]}
                        </td>
                        <td style={td}>{typeof r.aigc_score === "number" ? `${(r.aigc_score * 100).toFixed(1)}%` : "—"}</td>
                        <td style={{ ...td, textAlign: "left" }}>{applicationDescription(r.description, true).slice(0, 40)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 章节二：按班级汇总 */}
            <div style={{ marginTop: 28 }}>
              <div style={sectionTitle}>按班级汇总（仅展示有高风险/嫌疑的班级）</div>
              {classAggs.filter((c) => c.fake > 0 || c.suspect > 0).length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>当前范围内没有班级出现高风险/嫌疑申请。</div>
              ) : (
                <table style={tbl}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={th}>#</th>
                      <th style={{ ...th, textAlign: "left" }}>学院</th>
                      <th style={{ ...th, textAlign: "left" }}>班级</th>
                      <th style={th}>学生数</th>
                      <th style={th}>高风险</th>
                      <th style={th}>嫌疑</th>
                      <th style={th}>通过</th>
                      <th style={th}>待检测</th>
                      <th style={th}>检出率</th>
                      <th style={{ ...th, textAlign: "left" }}>班主任</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classAggs.filter((c) => c.fake > 0 || c.suspect > 0).map((c, i) => {
                      const checked = c.fake + c.suspect + c.real;
                      const detectRate = checked ? ((c.fake + c.suspect) / checked) * 100 : 0;
                      return (
                        <tr key={c.key}>
                          <td style={td}>{i + 1}</td>
                          <td style={{ ...td, textAlign: "left" }}>{c.college_name}</td>
                          <td style={{ ...td, textAlign: "left" }}>{c.class_label}</td>
                          <td style={td}>{c.students}</td>
                          <td style={{ ...td, color: c.fake ? "#b91c1c" : "#0f172a", fontWeight: c.fake ? 600 : 400 }}>{c.fake}</td>
                          <td style={{ ...td, color: c.suspect ? "#b45309" : "#0f172a" }}>{c.suspect}</td>
                          <td style={td}>{c.real}</td>
                          <td style={td}>{c.pending}</td>
                          <td style={td}>{detectRate.toFixed(1)}%</td>
                          <td style={{ ...td, textAlign: "left" }}>{c.advisor || "—"}</td>
                        </tr>
                      );
                    })}
                    {(() => {
                      const list = classAggs.filter((c) => c.fake > 0 || c.suspect > 0);
                      const sum = list.reduce(
                        (a, c) => ({
                          students: a.students + c.students,
                          fake: a.fake + c.fake,
                          suspect: a.suspect + c.suspect,
                          real: a.real + c.real,
                          pending: a.pending + c.pending,
                        }),
                        { students: 0, fake: 0, suspect: 0, real: 0, pending: 0 },
                      );
                      const checked = sum.fake + sum.suspect + sum.real;
                      const dr = checked ? ((sum.fake + sum.suspect) / checked) * 100 : 0;
                      return (
                        <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
                          <td style={td} colSpan={3}>合计</td>
                          <td style={td}>{sum.students}</td>
                          <td style={{ ...td, color: "#b91c1c" }}>{sum.fake}</td>
                          <td style={{ ...td, color: "#b45309" }}>{sum.suspect}</td>
                          <td style={td}>{sum.real}</td>
                          <td style={td}>{sum.pending}</td>
                          <td style={td}>{dr.toFixed(1)}%</td>
                          <td style={td}>—</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              )}
            </div>

            {/* 章节三：高风险/嫌疑学生完整名单（按班级分组） */}
            <div style={{ marginTop: 28 }}>
              <div style={sectionTitle}>高风险 / 嫌疑学生完整名单（按班级分组，便于下发辅导员）</div>
              {groupedRiskyStudents.groups.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>当前范围内无高风险/嫌疑学生。</div>
              ) : (
                <>
                  {groupedRiskyStudents.groups.map((g, gi) => {
                    const fakeStu = g.students.filter((s) => s.fake > 0).length;
                    const susStu = g.students.filter((s) => s.fake === 0 && s.suspect > 0).length;
                    const majors = Array.from(g.majors).join(" / ") || "—";
                    return (
                      <div key={gi} style={{ marginTop: gi === 0 ? 0 : 18, border: "1px solid #e2e8f0", borderRadius: 6, padding: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
                          {g.college_name} · {majors} · {g.class_label}
                          <span style={{ marginLeft: 8, fontWeight: 400, color: "#475569" }}>
                            （班主任：{g.advisor || "—"}）—— 高风险 <b style={{ color: "#b91c1c" }}>{fakeStu}</b> 人 / 嫌疑 <b style={{ color: "#b45309" }}>{susStu}</b> 人
                          </span>
                        </div>
                        <table style={{ ...tbl, marginTop: 6 }}>
                          <thead>
                            <tr style={{ background: "#f8fafc" }}>
                              <th style={th}>#</th>
                              <th style={{ ...th, textAlign: "left" }}>姓名</th>
                              <th style={{ ...th, textAlign: "left" }}>学号</th>
                              <th style={th}>性别</th>
                              <th style={{ ...th, textAlign: "left" }}>专业</th>
                              <th style={{ ...th, textAlign: "left" }}>电话</th>
                              <th style={{ ...th, textAlign: "left" }}>邮箱</th>
                              <th style={th}>高风险</th>
                              <th style={th}>嫌疑</th>
                              <th style={th}>最高概率</th>
                              <th style={th}>最近提交</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.students.map((s, si) => (
                              <tr key={s.student_id}>
                                <td style={td}>{si + 1}</td>
                                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{s.profile?.full_name || "—"}</td>
                                <td style={{ ...td, textAlign: "left" }}>{s.profile?.student_no || "—"}</td>
                                <td style={td}>{s.profile?.gender || "—"}</td>
                                <td style={{ ...td, textAlign: "left" }}>{s.profile?.major || "—"}</td>
                                <td style={{ ...td, textAlign: "left" }}>{s.profile?.phone || "—"}</td>
                                <td style={{ ...td, textAlign: "left", wordBreak: "break-all" }}>{s.profile?.email || "—"}</td>
                                <td style={{ ...td, color: s.fake ? "#b91c1c" : "#0f172a", fontWeight: s.fake ? 600 : 400 }}>{s.fake}</td>
                                <td style={{ ...td, color: s.suspect ? "#b45309" : "#0f172a" }}>{s.suspect}</td>
                                <td style={td}>{(s.maxScore * 100).toFixed(1)}%</td>
                                <td style={td}>{s.lastSubmittedAt ? new Date(s.lastSubmittedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {/* 每个学生的申请明细（仅 fake/suspect，最多 10 条） */}
                        {g.students.map((s) => {
                          const items = s.items
                            .filter((r) => r.aigc_status === "fake" || r.aigc_status === "suspect")
                            .sort((a, b) => (b.submitted_at < a.submitted_at ? -1 : 1))
                            .slice(0, 10);
                          if (items.length === 0) return null;
                          return (
                            <div key={`d-${s.student_id}`} style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
                                <b>{s.profile?.full_name || "—"}（{s.profile?.student_no || "—"}）</b> 申请明细
                              </div>
                              <table style={tbl}>
                                <thead>
                                  <tr style={{ background: "#f8fafc" }}>
                                    <th style={th}>#</th>
                                    <th style={th}>提交时间</th>
                                    <th style={th}>状态</th>
                                    <th style={th}>AI 概率</th>
                                    <th style={{ ...th, textAlign: "left" }}>申请描述</th>
                                    <th style={{ ...th, textAlign: "left" }}>申请ID</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((r, ri) => (
                                    <tr key={r.id}>
                                      <td style={td}>{ri + 1}</td>
                                      <td style={td}>{new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false })}</td>
                                      <td style={{ ...td, color: r.aigc_status === "fake" ? "#b91c1c" : "#b45309", fontWeight: 600 }}>
                                        {STATUS_LABELS[r.aigc_status]}
                                      </td>
                                      <td style={td}>{typeof r.aigc_score === "number" ? `${(r.aigc_score * 100).toFixed(1)}%` : "—"}</td>
                                      <td style={{ ...td, textAlign: "left" }}>{applicationDescription(r.description, true).slice(0, 60)}</td>
                                      <td style={{ ...td, textAlign: "left", fontFamily: "monospace", fontSize: 10 }}>{r.id.slice(0, 8)}…</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {groupedRiskyStudents.truncatedFrom && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#b45309" }}>
                      为控制 PDF 长度，已截断显示前 200 名学生（共 {groupedRiskyStudents.truncatedFrom} 名）。如需完整名单请使用 CSV 导出。
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 章节四：未匹配学生信息的申请 */}
            {orphanRows.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={sectionTitle}>未匹配学生信息的申请</div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                  以下申请在 profiles 中找不到对应学生记录（可能是已离校或档案缺失），请人工核实。
                </div>
                <table style={tbl}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={th}>#</th>
                      <th style={th}>提交时间</th>
                      <th style={th}>状态</th>
                      <th style={th}>AI 概率</th>
                      <th style={{ ...th, textAlign: "left" }}>学生 ID</th>
                      <th style={{ ...th, textAlign: "left" }}>申请描述</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphanRows.slice(0, 100).map((r, i) => (
                      <tr key={r.id}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}>{new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false })}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{STATUS_LABELS[r.aigc_status]}</td>
                        <td style={td}>{typeof r.aigc_score === "number" ? `${(r.aigc_score * 100).toFixed(1)}%` : "—"}</td>
                        <td style={{ ...td, textAlign: "left", fontFamily: "monospace", fontSize: 10 }}>{r.student_id?.slice(0, 8) ?? "—"}…</td>
                        <td style={{ ...td, textAlign: "left" }}>{applicationDescription(r.description, true).slice(0, 60)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const th: React.CSSProperties = {
  border: "1px solid #e2e8f0", padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#334155",
};
const td: React.CSSProperties = {
  border: "1px solid #e2e8f0", padding: "4px 6px", textAlign: "center", color: "#0f172a",
};
const tbl: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 11,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, marginBottom: 8, paddingBottom: 4,
  borderBottom: "1px solid #cbd5e1", color: "#0f172a",
};

function Kpi({ label, value, accent, onClick }: { label: string; value: string | number; accent?: string; onClick?: () => void }) {
  const clickable = !!onClick;
  return (
    <div
      className={`rounded-md border bg-card px-3 py-2 ${clickable ? "cursor-pointer transition hover:bg-muted/50" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function RiskyTable({
  rows, profiles, dayFocus, pieFocus, errReasons, onClearFocus, onRowClick,
}: {
  rows: Row[];
  pieFocus: string | null;
  errReasons: Map<string, string>;
  profiles: Map<string, ProfileLite>;
  dayFocus: string | null;
  onClearFocus: () => void;
  onRowClick: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
        {pieFocus ? `当前范围内没有「${pieFocus}」的申请` : "当前范围内无高风险或嫌疑申请"}
        {(dayFocus || pieFocus) && (
          <Button variant="link" size="sm" onClick={onClearFocus} className="ml-2">清除聚焦</Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2" id="aigc-detail-list">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{pieFocus ? `「${pieFocus}」申请明细` : "高风险 / 嫌疑申请明细"}（点击行进入详情）</div>
        {(dayFocus || pieFocus) && (
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="secondary">已聚焦：{pieFocus ?? dayFocus}</Badge>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClearFocus}>清除</Button>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">提交时间</th>
              <th className="px-2 py-2 text-left">状态</th>
              <th className="px-2 py-2 text-left">{pieFocus === "失败" ? "失败原因" : "AI 生成概率"}</th>
              <th className="px-2 py-2 text-left">学生</th>
              <th className="px-2 py-2 text-left">申请描述</th>
              <th className="px-2 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = r.student_id ? profiles.get(r.student_id) : null;
              return (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t transition hover:bg-muted/40"
                  onClick={() => onRowClick(r.id)}
                >
                  <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false })}</td>
                  <td className={`px-2 py-2 font-medium ${r.aigc_status === "fake" || r.aigc_status === "error" ? "text-destructive" : r.aigc_status === "real" ? "text-success" : "text-warning"}`}>
                    {STATUS_LABELS[r.aigc_status]}
                  </td>
                  <td className="px-2 py-2">{r.aigc_status === "error" ? (errReasons.get(r.id) ?? "读取佐证材料图片时出错") : typeof r.aigc_score === "number" ? `${(r.aigc_score * 100).toFixed(1)}%` : "—"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {p ? `${p.full_name ?? "—"}（${p.student_no ?? "—"}）` : "—"}
                  </td>
                  <td className="px-2 py-2 max-w-[280px] truncate" title={applicationDescription(r.description, true)}>
                    {titleOfDesc(r.description)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); onRowClick(r.id); }}
                    >
                      查看
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function titleOfDesc(d: string | null) {
  const items = deserializeItems(d ?? "");
  const t = items.map((it) => it.achievement).filter(Boolean).slice(0, 2).join(" · ");
  return t || applicationDescription(d, true).slice(0, 30);
}

function EmptyChart() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无数据</div>;
}