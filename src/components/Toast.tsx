import { useEffect } from "react";
import { Icon } from "../icons";

export function Toast({ msg, error, onDone }: { msg: string; error?: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [msg, onDone]);

  return (
    <div className={`toast${error ? " error" : ""}`} role="status">
      <span className="t-ico">
        <Icon name={error ? "x" : "check"} size={14} />
      </span>
      {msg}
    </div>
  );
}
