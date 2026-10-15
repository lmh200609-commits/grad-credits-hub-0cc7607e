import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";

export type ExportTask = {
  /** 压缩包内的相对目录，如 "计科2101/2024001-白雪" */
  folder: string;
  /** 文件名，如 "申请表.xlsx" */
  name: string;
  /** Storage 中的路径 */
  path: string;
  /** 失败时展示给用户的描述 */
  who: string;
  /** 同一分组的文件不会被拆到不同分卷，通常用 folder */
  group: string;
};

export type ExportProgress = {
  volume: number;
  done: number;
  total: number;
  elapsedMs: number;
  etaMs: number | null;
};

const MAX_BYTES = 1.2e9;
const MAX_FILES = 600;
const SIGN_CHUNK = 100;
const SIGN_TTL = 60 * 60;
const MAX_CONCURRENCY = 6;
const MIN_CONCURRENCY = 2;
const MAX_RETRY = 2;

/** 已压缩过的格式直接存储，压缩收益极小却很耗时 */
const STORE_EXT = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "pdf",
  "zip", "rar", "7z", "mp4", "mov", "mp3", "docx", "xlsx", "pptx",
]);

const extOf = (name: string) => (/\.([a-zA-Z0-9]{1,6})$/.exec(name)?.[1] ?? "").toLowerCase();

const zipOptionsFor = (name: string): JSZip.JSZipFileOptions =>
  STORE_EXT.has(extOf(name))
    ? { compression: "STORE" }
    : { compression: "DEFLATE", compressionOptions: { level: 6 } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ExportAborted extends Error {
  constructor() {
    super("导出已取消");
    this.name = "ExportAborted";
  }
}

/** 批量申请临时下载地址，减少请求往返 */
async function signPaths(bucket: string, paths: string[]) {
  const map = new Map<string, string>();
  for (let i = 0; i < paths.length; i += SIGN_CHUNK) {
    const chunk = paths.slice(i, i + SIGN_CHUNK);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(chunk, SIGN_TTL);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
    }
  }
  return map;
}

/** 导出前体检：确认当前网络下文件服务可访问 */
export async function checkStorageReachable(bucket: string, samplePath: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(samplePath, 300);
  if (error || !data?.signedUrl) return false;
  try {
    const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-0" } });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url: string, signal: AbortSignal | undefined, onFail: () => void, onOk: () => void) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    if (signal?.aborted) throw new ExportAborted();
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      onOk();
      return blob;
    } catch (e) {
      if (signal?.aborted) throw new ExportAborted();
      lastErr = e;
      onFail();
      if (attempt < MAX_RETRY) await sleep(400 * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("下载失败");
}

type RunOptions = {
  bucket: string;
  /** 压缩包内的顶层目录名，同时作为文件名前缀 */
  rootName: string;
  tasks: ExportTask[];
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
  /** 直接放进压缩包根目录的附加文件（如清单表），不计入任务总数 */
  extraFiles?: { name: string; content: Blob }[];
};

export async function runZipExport({ bucket, rootName, tasks, signal, onProgress, extraFiles }: RunOptions) {
  const started = Date.now();
  const total = tasks.length;
  let done = 0;
  let volume = 1;
  const failures: ExportTask[] = [];

  // 自适应并发：连续失败降速，成功后逐步恢复
  let concurrency = MAX_CONCURRENCY;
  let streak = 0;
  const onFail = () => {
    streak = 0;
    concurrency = MIN_CONCURRENCY;
  };
  const onOk = () => {
    streak += 1;
    if (streak >= 10 && concurrency < MAX_CONCURRENCY) {
      concurrency = Math.min(MAX_CONCURRENCY, concurrency + 1);
      streak = 0;
    }
  };

  const urls = await signPaths(bucket, Array.from(new Set(tasks.map((t) => t.path))));

  // 按分组归拢，保证同一学生的材料不跨分卷
  const groups: ExportTask[][] = [];
  const index = new Map<string, number>();
  for (const t of tasks) {
    let i = index.get(t.group);
    if (i === undefined) {
      i = groups.length;
      index.set(t.group, i);
      groups.push([]);
    }
    groups[i].push(t);
  }

  let zip = new JSZip();
  let root = zip.folder(rootName)!;
  let volBytes = 0;
  let volFiles = 0;
  const volumeNames: string[] = [];

  // 附加文件（清单表等）放进第一卷的根目录
  for (const f of extraFiles ?? []) {
    root.file(f.name, f.content, zipOptionsFor(f.name));
    volBytes += f.content.size;
    volFiles += 1;
  }

  const report = () => {
    const elapsedMs = Date.now() - started;
    const etaMs = done > 0 ? Math.round((elapsedMs / done) * (total - done)) : null;
    onProgress?.({ volume, done, total, elapsedMs, etaMs });
  };

  const flush = async (isLast: boolean) => {
    if (volFiles === 0 && failures.length === 0) return;
    if (volFiles === 0 && !isLast) return;
    if (isLast && failures.length > 0) {
      root.file(
        "导出失败清单.txt",
        ["以下文件未能下载，请稍后在导出页点击「只重试失败项」：", "", ...failures.map((f) => `- ${f.who}（${f.folder}/${f.name}）`)].join("\n"),
        { compression: "DEFLATE" },
      );
      volFiles += 1;
    }
    if (volFiles === 0) return;
    const multi = volumeNames.length > 0 || !isLast;
    const fileName = multi ? `${rootName}-学生材料-第${volume}卷.zip` : `${rootName}-学生材料.zip`;
    const blob = await zip.generateAsync({ type: "blob", streamFiles: true });
    saveAs(blob, fileName);
    volumeNames.push(fileName);
    // 释放引用，便于浏览器回收内存
    zip = new JSZip();
    root = zip.folder(rootName)!;
    volBytes = 0;
    volFiles = 0;
    if (!isLast) {
      volume += 1;
      report();
      await sleep(600);
    }
  };

  // 每次并发处理若干个分组，分组处理完再判断是否需要切卷
  const BATCH_GROUPS = 4;
  for (let g = 0; g < groups.length; g += BATCH_GROUPS) {
    if (signal?.aborted) throw new ExportAborted();
    const batch = groups.slice(g, g + BATCH_GROUPS).flat();
    const results: (Blob | null)[] = new Array(batch.length).fill(null);

    let cursor = 0;
    const worker = async (id: number) => {
      while (cursor < batch.length) {
        if (id >= concurrency) return;
        const i = cursor++;
        const t = batch[i];
        const url = urls.get(t.path);
        try {
          if (!url) throw new Error("无法获取下载地址");
          results[i] = await fetchWithRetry(url, signal, onFail, onOk);
        } catch (e) {
          if (e instanceof ExportAborted) throw e;
          failures.push(t);
        } finally {
          done += 1;
          report();
        }
      }
    };
    await Promise.all(Array.from({ length: MAX_CONCURRENCY }, (_, i) => worker(i)));

    batch.forEach((t, i) => {
      const blob = results[i];
      if (!blob) return;
      root.file(`${t.folder}/${t.name}`, blob, zipOptionsFor(t.name));
      volBytes += blob.size;
      volFiles += 1;
    });

    const more = g + BATCH_GROUPS < groups.length;
    if (more && (volBytes >= MAX_BYTES || volFiles >= MAX_FILES)) {
      await flush(false);
    }
  }

  await flush(true);
  report();
  return { failures, volumes: volumeNames.length, exported: total - failures.length, total };
}
