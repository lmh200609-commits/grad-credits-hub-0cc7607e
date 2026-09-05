import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";

const BUCKET = "application-files";

type Props = {
  path: string;
  /** 下载时使用的文件名 */
  downloadName?: string;
};

/** 学生提交的原始申请表：页面内直接渲染表格内容，并可下载原文件 */
export default function FormFilePreview({ path, downloadName = "申请表.xlsx" }: Props) {
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const signedUrl = useCallback(async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw error || new Error("无法获取文件地址");
    return data.signedUrl;
  }, [path]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setFailed(null);
      try {
        const url = await signedUrl();
        const buf = await (await fetch(url)).arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils
          .sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" })
          .map((r) => r.map((c) => String(c ?? "").trim()));
        // 去掉完全空白的行
        const cleaned = rows.filter((r) => r.some((c) => c !== ""));
        if (alive) setGrid(cleaned);
      } catch {
        if (alive) setFailed("申请表内容暂时无法显示，可点击下载查看原文件");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedUrl]);

  const download = async () => {
    setDownloading(true);
    try {
      const url = await signedUrl();
      const blob = await (await fetch(url)).blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
    } catch {
      toast({ title: "下载失败", description: "无法获取申请表文件", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const width = grid ? Math.max(...grid.map((r) => r.length)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-muted-foreground">
          <FileSpreadsheet className="h-3.5 w-3.5" /> 学生提交的原申请表
        </div>
        <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
          {downloading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}
          下载原表
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在载入申请表…
        </div>
      )}

      {!loading && failed && (
        <div className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground">{failed}</div>
      )}

      {!loading && !failed && grid && (
        <div className="max-h-[420px] overflow-auto rounded border">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {grid.map((row, ri) => (
                <tr key={ri} className="even:bg-muted/20">
                  {Array.from({ length: width }).map((_, ci) => (
                    <td key={ci} className="whitespace-pre-wrap border px-2 py-1 align-top">
                      {row[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
