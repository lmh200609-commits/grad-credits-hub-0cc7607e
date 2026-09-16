import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderArchive } from "lucide-react";
import { toastError } from "@/lib/errors";
import { useAuth } from "@/hooks/useAuth";

type Win = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
};

const fmt = (s: string) => new Date(s).toLocaleString("zh-CN", { hour12: false });

export default function Exports() {
  const navigate = useNavigate();
  const { collegeId, isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<Win[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("submission_windows")
        .select("id,name,starts_at,ends_at")
        .order("starts_at", { ascending: false })
        .limit(100);
      if (!isSuperAdmin && collegeId) q = q.eq("college_id", collegeId);
      const { data, error } = await q;
      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      toastError(e, "加载批次失败");
    } finally {
      setLoading(false);
    }
  }, [collegeId, isSuperAdmin]);

  useEffect(() => { void load(); }, [load]);

  const now = Date.now();

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="材料导出"
          description="选择一个提交批次，把学生的申请表和佐证材料按「班级 / 学号-姓名」打包下载"
        />
        <Card>
          <CardHeader>
            <CardTitle>提交批次</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无提交批次</div>
            ) : (
              rows.map((w) => {
                const start = new Date(w.starts_at).getTime();
                const end = new Date(w.ends_at).getTime();
                const state = now < start ? "未开始" : now > end ? "已结束" : "进行中";
                return (
                  <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{w.name}</span>
                        <Badge variant={state === "进行中" ? "default" : "secondary"}>{state}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{fmt(w.starts_at)} — {fmt(w.ends_at)}</div>
                    </div>
                    <Button variant="outline" onClick={() => navigate(`/admin/windows/${w.id}/export`)}>
                      <FolderArchive className="mr-1 h-4 w-4" />导出材料
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
