"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f6f4ef",
          color: "#17211b",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <main
          style={{
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e7e2d8",
            borderRadius: "20px",
            padding: "32px",
          }}
        >
          <h1 style={{ fontSize: "20px", margin: "0 0 8px" }}>
            Aplikasi gagal dimuat
          </h1>
          <p style={{ fontSize: "14px", color: "#5c665f", margin: "0 0 8px" }}>
            Terjadi kesalahan fatal. Muat ulang halaman untuk mencoba lagi.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "12px",
                color: "#8a938d",
                fontFamily: "monospace",
                margin: "0 0 16px",
              }}
            >
              Referensi: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "16px",
              padding: "10px 18px",
              borderRadius: "12px",
              border: "none",
              background: "#0e8f66",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Coba Lagi
          </button>
        </main>
      </body>
    </html>
  );
}
