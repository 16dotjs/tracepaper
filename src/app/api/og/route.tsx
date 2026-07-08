import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo") ?? "owner/repo";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0A1F2E",
        backgroundImage:
          "linear-gradient(rgba(232,241,245,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(232,241,245,0.06) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: "2px solid #E8F1F5",
          borderRadius: 8,
          padding: "48px 64px",
          backgroundColor: "#0F2A3D",
          maxWidth: 960,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: "#6B8FA3",
            letterSpacing: 3,
            marginBottom: 20,
          }}
        >
          TRACEPAPER — REPOSITORY ANALYSIS
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 700,
            color: "#E8F1F5",
          }}
        >
          {repo}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "#D4552E",
            marginTop: 24,
          }}
        >
          → Understand this codebase in minutes
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
