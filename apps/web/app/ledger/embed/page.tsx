export default function LedgerEmbed() {
  return (
    <iframe
      title="Ledger embed"
      src="/ledger/index.html"
      style={{
        width: "100%",
        minHeight: "400px",
        border: "0",
        background: "#fff",
      }}
    />
  );
}
