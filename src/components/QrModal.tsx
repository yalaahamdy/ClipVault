import { useEffect, useState } from "react";
import { api } from "../api";
import { Icon } from "../icons";
import { useT } from "../i18n";

/**
 * QR share modal — turns any text/URL into a scannable QR code so the content
 * can jump to a phone instantly, without cloud, without accounts.
 */
export function QrModal({ text, onClose }: { text: string; onClose: () => void }) {
  const t = useT();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setDataUrl(null);
    setError(null);
    api
      .qrGenerate(text)
      .then((url) => {
        if (alive) setDataUrl(url);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const copyImage = async () => {
    if (!dataUrl) return;
    setBusy(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const png = blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      // notify is handled by caller via toast hook? Keep simple: emit through window event
      window.dispatchEvent(new CustomEvent("clipvault:qr-copied"));
    } catch {
      setError("CLIPBOARD_IMG_UNSUPPORTED");
    }
    setBusy(false);
  };

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "clipvault-qr.png";
    a.click();
    window.dispatchEvent(new CustomEvent("clipvault:qr-saved"));
  };

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("qr.title")}>
        <header className="qr-head">
          <h3><Icon name="qr" size={16} /> {t("qr.title")}</h3>
          <button className="icon-btn" onClick={onClose} title={t("qr.close")}>
            <Icon name="x" size={14} />
          </button>
        </header>

        <div className="qr-body">
          {dataUrl ? (
            <img className="qr-image" src={dataUrl} alt={t("qr.title")} draggable={false} />
          ) : error ? (
            <div className="qr-error">{t("toast.qrEmpty")}</div>
          ) : (
            <div className="qr-skeleton skel-block" />
          )}
          <p className="qr-hint"><Icon name="smartphone" size={12} /> {t("qr.hint")}</p>

          {text && (
            <div className="qr-content selectable" dir="auto">
              <span className="qr-content-label">{t("qr.contentLabel")}</span>
              {text.length > 220 ? `${text.slice(0, 220)}…` : text}
            </div>
          )}
        </div>

        <footer className="qr-actions">
          <button className="btn primary" disabled={!dataUrl || busy} onClick={copyImage}>
            <Icon name="copy" size={13} /> {t("qr.copyImage")}
          </button>
          <button className="btn" disabled={!dataUrl} onClick={download}>
            <Icon name="download" size={13} /> {t("qr.download")}
          </button>
          <button className="btn" onClick={onClose}>
            {t("qr.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}
