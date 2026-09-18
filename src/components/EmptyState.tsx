import { Icon } from "../icons";

export function EmptyFirstRun({ shortcut }: { shortcut: string }) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name="clipboard" size={30} strokeWidth={1.4} /></div>
      <h3>أهلًا بك في ClipVault</h3>
      <p>
        انسخ أي نص أو صورة أو ملف كما تفعل دائمًا، وسيظهر هنا فورًا.
        لا حاجة لترتيب أي شيء — ابحث فقط عند الحاجة.
      </p>
      <div className="kbd-chip">
        اضغط <kbd>{shortcut}</kbd> في أي وقت لإظهار هذه النافذة أو إخفائها
      </div>
    </div>
  );
}

export function EmptyResults() {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name="search" size={28} strokeWidth={1.4} /></div>
      <h3>لا توجد نتائج مطابقة</h3>
      <p>جرّب كلمة أقصر أو غيّر التصفية أعلى القائمة.</p>
    </div>
  );
}

export function EmptyFiltered() {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name="folder" size={28} strokeWidth={1.4} /></div>
      <h3>لا يوجد شيء في هذا التصنيف بعد</h3>
      <p>ستظهر العناصر هنا تلقائيًا أثناء نسخ المحتوى من أي تطبيق.</p>
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
