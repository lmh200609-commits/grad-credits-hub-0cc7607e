import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ZoomableImage from "@/components/ZoomableImage";
import { FileText, ImageOff } from "lucide-react";

type Attachment = {
  id: string;
  file_path: string;
  file_name: string | null;
  sort_order: number | null;
};

const IMG_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

/**
 * 申请的多张佐证材料画廊：缩略图网格 + 点击放大（滚轮缩放/拖动）。
 */
export default function AttachmentsGallery({ applicationId, fallbackPath }: { applicationId: string; fallbackPath?: string | null }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState<Attachment | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("application_attachments")
        .select("id, file_path, file_name, sort_order")
        .eq("application_id", applicationId)
        .order("sort_order", { ascending: true });
      let list = (data as Attachment[]) ?? [];
      // 兼容旧数据：无附件记录时回退到单张 file_path
      if (list.length === 0 && fallbackPath && IMG_RE.test(fallbackPath)) {
        list = [{ id: "legacy", file_path: fallbackPath, file_name: "佐证材料", sort_order: 0 }];
      }
      setItems(list);
      const m = new Map<string, string>();
      await Promise.all(list.map(async (a) => {
        const { data: s } = await supabase.storage.from("application-files").createSignedUrl(a.file_path, 600);
        if (s?.signedUrl) m.set(a.id, s.signedUrl);
      }));
      setUrls(m);
    })();
  }, [applicationId, fallbackPath]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((a) => {
          const url = urls.get(a.id);
          const isImg = IMG_RE.test(a.file_path);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => { if (!url) return; if (isImg) setOpen(a); else window.open(url, "_blank", "noopener"); }}
              className="group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted/30 text-left"
            >
              {isImg && url ? (
                <img src={url} alt={a.file_name ?? "佐证材料"} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
              ) : isImg ? (
                <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-5 w-5" /></div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
                  <FileText className="h-6 w-6" />
                  <span className="line-clamp-2 break-all px-1 text-center text-xs">{a.file_name ?? "附件"}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">共 {items.length} 份佐证材料，点击查看（PDF 在新窗口打开）</p>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-4xl">
          {open && urls.get(open.id) && (
            <ZoomableImage src={urls.get(open.id)!} alt={open.file_name ?? "佐证材料"} openUrl={urls.get(open.id)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
