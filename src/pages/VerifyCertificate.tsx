import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { displayError } from "@/lib/displayText";

type VerifyResult =
  | { ok: true; student_name: string; student_no: string; school: string; department: string | null; credit: number; project: string; issued_at: string; certificate_no: string }
  | { ok: false; error: string };

const VerifyCertificate = () => {
  const { certNo } = useParams();
  const [r, setR] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!certNo) return;
    const url = `https://eceqokilpppnwtfzgbvq.supabase.co/functions/v1/verify-certificate?no=${encodeURIComponent(certNo)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => setR(data))
      .catch(() => setR({ ok: false, error: "网络错误" }));
  }, [certNo]);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            {!r ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> 验证中…</>
            ) : r.ok ? (
              <><CheckCircle2 className="h-6 w-6 text-green-600" /> 证书有效</>
            ) : (
              <><XCircle className="h-6 w-6 text-destructive" /> 证书无效</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="text-muted-foreground">证书编号：{certNo}</div>
          {r && r.ok && (
            <>
              <Row k="学校" v={r.school} />
              <Row k="姓名" v={r.student_name} />
              <Row k="学号" v={r.student_no} />
              <Row k="院系" v={r.department ?? "—"} />
              <Row k="认定项目" v={r.project} />
              <Row k="认定学分" v={String(r.credit)} />
              <Row k="签发日期" v={new Date(r.issued_at).toLocaleDateString("zh-CN")} />
            </>
          )}
          {r && !r.ok && "error" in r && (
            <p className="text-destructive">{displayError(r.error)}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex">
    <span className="w-24 text-muted-foreground">{k}：</span>
    <span className="font-medium">{v}</span>
  </div>
);

export default VerifyCertificate;