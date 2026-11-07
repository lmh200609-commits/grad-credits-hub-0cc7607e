import { forwardRef } from "react";
import { gradeOf } from "@/lib/creditStandard";

const SEAL_TEXT = "长春财经学院国际经济贸易学院";
// 电子公章暂不使用（改为打印后统一线下盖章）
export const Seal = () => {
  const r = 62;
  const chars = SEAL_TEXT.split("");
  const span = 250;
  return (
    <svg
      width={160}
      height={160}
      viewBox="0 0 160 160"
      style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-55%) rotate(-8deg)", opacity: 0.82, pointerEvents: "none" }}
    >
      <circle cx="80" cy="80" r="74" fill="none" stroke="#d11a1a" strokeWidth="4" />
      {chars.map((c, i) => {
        const a = (-span / 2 + (span / (chars.length - 1)) * i) * (Math.PI / 180);
        const x = 80 + r * Math.sin(a);
        const y = 80 - r * Math.cos(a);
        return (
          <text key={i} x={x} y={y} fill="#d11a1a" fontSize="15" fontWeight="700" textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(${(a * 180) / Math.PI} ${x} ${y})`}>{c}</text>
        );
      })}
      <polygon
        fill="#d11a1a"
        points={Array.from({ length: 10 }, (_, i) => {
          const rr = i % 2 === 0 ? 24 : 10;
          const a = (Math.PI / 5) * i - Math.PI / 2;
          return `${80 + rr * Math.cos(a)},${84 + rr * Math.sin(a)}`;
        }).join(" ")}
      />
    </svg>
  );
};

export type CertificateData = {
  school: string;
  studentName: string;
  studentNo: string;
  department: string;
  major?: string | null;
  idCard?: string | null;
  photoDataUrl?: string | null;
  certificateNo: string;
  credit: number;
  projectTitle: string;
  description: string;
  reviewerName?: string | null;
  issuedAt: string; // ISO
  qrDataUrl?: string | null;
};

const maskId = (id?: string | null) => {
  if (!id) return "—";
  const s = id.trim();
  if (s.length < 8) return s;
  return s.slice(0, 4) + "*".repeat(Math.max(0, s.length - 8)) + s.slice(-4);
};

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  } catch {
    return iso;
  }
};

/**
 * A4 证书。横版 1123×794、竖版 794×1123（@96dpi）。
 * 用纯内联样式，避免 html2canvas 离屏渲染时丢失 Tailwind CSS 变量。
 */
const CertificatePreview = forwardRef<
  HTMLDivElement,
  { data: CertificateData; orientation?: "landscape" | "portrait" }
>(({ data, orientation = "landscape" }, ref) => {
    const isPortrait = orientation === "portrait";
    const W = isPortrait ? 794 : 1123;
    const H = isPortrait ? 1123 : 794;
    return (
      <div
        ref={ref}
        style={{
          width: W,
          height: H,
          background: "#fffdf6",
          padding: isPortrait ? 48 : 56,
          fontFamily:
            '"PingFang SC","Microsoft YaHei","Hiragino Sans GB",-apple-system,system-ui,sans-serif',
          color: "#1a1a1a",
          position: "relative",
          boxSizing: "border-box",
          border: "8px double #8b5a2b",
        }}
      >
        {/* 顶部 */}
        <div style={{ textAlign: "center", marginBottom: isPortrait ? 32 : 24 }}>
          <div style={{ fontSize: isPortrait ? 26 : 28, fontWeight: 700, letterSpacing: 3, color: "#8b1c1c" }}>
            长春财经学院2027届本科生
          </div>
          <div
            style={{
              fontSize: isPortrait ? 34 : 38,
              fontWeight: 800,
              letterSpacing: isPortrait ? 6 : 8,
              marginTop: 8,
              color: "#1a1a1a",
            }}
          >
            创新实践学分认定证明
          </div>
          <div style={{ marginTop: 12, fontSize: 14, color: "#6b6b6b" }}>
            CREDIT CERTIFICATION · 证书编号：{data.certificateNo}
          </div>
        </div>

        {/* 正文 + 照片 */}
        <div
          style={{
            display: "flex",
            flexDirection: isPortrait ? "column" : "row",
            alignItems: isPortrait ? "center" : "flex-start",
            gap: isPortrait ? 24 : 32,
            marginTop: 24,
          }}
        >
          <div
            style={{
              width: 160,
              height: 200,
              border: "1px solid #c4c4c4",
              background: "#f3f3f3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {data.photoDataUrl ? (
              <img
                src={data.photoDataUrl}
                alt="学生照片"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                crossOrigin="anonymous"
              />
            ) : (
              <span style={{ color: "#999", fontSize: 14 }}>学生照片</span>
            )}
          </div>

          <div
            style={{
              flex: 1,
              width: isPortrait ? "100%" : undefined,
              fontSize: 17,
              lineHeight: 2,
            }}
          >
            <Row label="姓名" value={data.studentName} />
            <Row label="学号" value={data.studentNo} />
            <Row label="院系" value={data.department || "—"} />
            {data.major && <Row label="专业" value={data.major} />}
            <Row label="身份证号" value={maskId(data.idCard)} />
            <Row label="学校" value={data.school} />
          </div>
        </div>

        {/* 认定描述 */}
        <div
          style={{
            marginTop: isPortrait ? 40 : 28,
            fontSize: isPortrait ? 18 : 19,
            lineHeight: 2.2,
          }}
        >
          {"\u3000\u3000"}经长春财经学院国际经济贸易学院创新实践学分认定工作组审核，认定授予创新实践学分等级
          <span
            style={{
              fontWeight: 900,
              fontSize: 32,
              color: "#8b1c1c",
              margin: "0 18px",
              padding: "0 10px",
              letterSpacing: 6,
              borderBottom: "3px solid #8b1c1c",
              fontFamily: '"STKaiti","KaiTi","楷体",serif',
            }}
          >
            {gradeOf(Number(data.credit) || 0).label}
          </span>
          。
        </div>
        <div style={{ marginTop: 16, fontSize: isPortrait ? 18 : 19, textIndent: "2em" }}>特此证明。</div>


        {/* 底部签发信息 */}
        <div
          style={{
            position: "absolute",
            right: isPortrait ? 64 : 80,
            bottom: isPortrait ? 80 : 64,
            textAlign: "center",
            fontSize: 16,
            lineHeight: 2,
          }}
        >
          <div style={{ position: "relative" }}>
            <div style={{ position: "relative" }}>长春财经学院国际经济贸易学院</div>
            <div style={{ position: "relative" }}>{fmtDate(data.issuedAt)}</div>
          </div>
        </div>
      </div>
    );
});

CertificatePreview.displayName = "CertificatePreview";

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: "flex" }}>
    <span style={{ width: 96, color: "#666" }}>{label}：</span>
    <span style={{ fontWeight: 600 }}>{value}</span>
  </div>
);

export default CertificatePreview;