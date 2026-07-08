import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Tracepaper — understand any GitHub repository in minutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#6B8FA3",
            letterSpacing: 4,
            marginBottom: 16,
          }}
        >
          AI-POWERED REPOSITORY ANALYSIS
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: "#E8F1F5",
            letterSpacing: 2,
          }}
        >
          tracepaper
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#F5F1E8",
            marginTop: 20,
          }}
        >
          Understand any GitHub repository in minutes
        </div>
      </div>
    </div>,
    { ...size },
  );
}
