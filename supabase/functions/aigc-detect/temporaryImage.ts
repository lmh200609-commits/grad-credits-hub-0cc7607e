type UploadToken = {
  AccessKeyId: string; AccessKeySecret: string; SecurityToken: string;
  FileNamePrefix: string; OssInternetEndPoint: string; BucketName: string;
};

export function ossCanonicalRequest(method: string, date: string, token: string, bucket: string, key: string): string {
  return `${method}\n\n${method === "PUT" ? "image/jpeg" : ""}\n${date}\nx-oss-security-token:${token}\n/${bucket}/${key}`;
}

export async function uploadTemporaryImage(token: UploadToken, bytes: ArrayBuffer): Promise<{ key: string; remove: () => Promise<void> }> {
  const endpoint = new URL(token.OssInternetEndPoint.startsWith("http") ? token.OssInternetEndPoint : `https://${token.OssInternetEndPoint}`);
  if (!endpoint.hostname.endsWith(".aliyuncs.com") || !/^[a-z0-9-]+$/.test(token.BucketName)) throw new Error("阿里云图片上传配置无效。");
  const key = `${token.FileNamePrefix}${crypto.randomUUID()}.jpg`;
  const url = `https://${token.BucketName}.${endpoint.hostname}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const signingKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(token.AccessKeySecret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const send = async (method: "PUT" | "DELETE") => {
    const date = new Date().toUTCString();
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(ossCanonicalRequest(method, date, token.SecurityToken, token.BucketName, key))));
    const encoded = btoa(String.fromCharCode(...signature));
    return fetch(url, {
      method,
      headers: { Date: date, "x-oss-security-token": token.SecurityToken, Authorization: `OSS ${token.AccessKeyId}:${encoded}`, ...(method === "PUT" ? { "Content-Type": "image/jpeg" } : {}) },
      body: method === "PUT" ? bytes : undefined,
      signal: AbortSignal.timeout(12000),
    });
  };
  const response = await send("PUT");
  if (!response.ok) throw new Error("上传到阿里云临时检测空间失败，请管理员检查图片检测权限。");
  return { key, remove: async () => { const result = await send("DELETE"); if (!result.ok) console.warn("[aigc-detect] temporary image cleanup unavailable"); } };
}