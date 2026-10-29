// 把 PDF 前几页渲染成 JPEG（约 250 DPI），供自动核对使用；PDF 原件仍保留给老师查看
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_PREVIEW_PAGES = 10;
/** 预览图路径：<pdf路径>.p<页码>.jpg */
export const pdfPreviewPath = (pdfPath: string, page: number) => `${pdfPath}.p${page}.jpg`;
/** 预览图对应的 PDF 原件路径；不是预览图则返回 null */
export const pdfPathOfPreview = (p: string) => p.match(/^(.*\.pdf)\.p\d+\.jpg$/i)?.[1] ?? null;

export async function renderPdfPages(file: File, maxPages = PDF_PREVIEW_PAGES): Promise<Blob[]> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: Blob[] = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      let scale = 250 / 72;
      const base = page.getViewport({ scale: 1 });
      const longest = Math.max(base.width, base.height) * scale;
      if (longest > 2400) scale *= 2400 / longest; // 控制体积
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
      if (blob) out.push(blob);
      canvas.width = canvas.height = 0;
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
