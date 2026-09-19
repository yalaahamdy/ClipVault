import { Icon } from "../icons";
import { useT } from "../i18n";

export function EmptyFirstRun({ shortcut }: { shortcut: string }) {
  const t = useT();
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name="clipboard" size={30} strokeWidth={1.4} /></div>
      <h3>{t("empty.firstTitle")}</h3>
      <p>{t("empty.firstBody")}</p>
      <div className="kbd-chip">
        {t("empty.firstKbd", { shortcut })}
      </div>
    </div>
  );
}

export function EmptyResults() {
  const t = useT();
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name="search" size={28} strokeWidth={1.4} /></div>
      <h3>{t("empty.resultsTitle")}</h3>
      <p>{t("empty.resultsBody")}</p>
    </div>
  );
}

export function EmptyFiltered() {
  const t = useT();
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name="folder" size={28} strokeWidth={1.4} /></div>
      <h3>{t("empty.filteredTitle")}</h3>
      <p>{t("empty.filteredBody")}</p>
    </div>
  );
}

export function Skeletons({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton" key={i}>
          <div className="skel-block" style={{ width: 30, height: 30 }} />
          <div style={{ flex: 1 }}>
            <div className="skel-block" style={{ width: "88%", height: 11, marginBottom: 7 }} />
            <div className="skel-block" style={{ width: "55%", height: 11 }} />
          </div>
        </div>
      ))}
    </>
  );
}
