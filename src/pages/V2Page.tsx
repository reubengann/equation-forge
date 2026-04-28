const V2_DEV_FALLBACK_URL = "http://localhost:5174";

function getV2AppUrl(): string {
  const configuredUrl = import.meta.env.VITE_V2_APP_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }
  return V2_DEV_FALLBACK_URL;
}

export function V2Page() {
  const v2Url = getV2AppUrl();

  return (
    <section
      style={{
        display: "grid",
        gap: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <p style={{ margin: 0 }}>
          This page hosts the isolated v2 app without importing any v2 source into v1.
        </p>
        <a
          href={v2Url}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--dp-border)",
            background: "var(--dp-surface)",
            color: "inherit",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Open v2 in new tab
        </a>
      </div>

      <iframe
        title="Physics Derivation Pad v2"
        src={v2Url}
        style={{
          width: "100%",
          minHeight: "calc(100vh - 180px)",
          border: "1px solid var(--dp-border)",
          borderRadius: 12,
          background: "var(--dp-surface)",
        }}
      />
    </section>
  );
}
