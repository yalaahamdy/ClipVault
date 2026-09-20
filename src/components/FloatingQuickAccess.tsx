import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "../icons";
import { useI18n } from "../i18n";
import "../styles/floating-quick-access.css";

export interface FloatingQuickAccessProps {
  enabled: boolean;
  totalItems: number;
  onNavigate: (view: "home" | "list" | "passwords" | "typing" | "settings") => void;
  onQuickAdd: (text: string) => Promise<void>;
  onTriggerSearch: () => void;
}

interface RadialItem {
  id: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  className: string;
  action: () => void;
}

export const FloatingQuickAccess: React.FC<FloatingQuickAccessProps> = ({
  enabled,
  totalItems,
  onNavigate,
  onQuickAdd,
  onTriggerSearch,
}) => {
  const { lang } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Position state (persisted in localStorage)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem("clipvault_floating_pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    // Default: bottom-right corner
    return { x: window.innerWidth - 76, y: window.innerHeight - 150 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number; moved: boolean }>({
    x: 0,
    y: 0,
    posX: 0,
    posY: 0,
    moved: false,
  });

  // Haptic feedback helper
  const triggerHaptic = useCallback((ms: number = 20) => {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(ms);
      }
    } catch { /* ignore */ }
  }, []);

  // Save pos on update
  useEffect(() => {
    try {
      localStorage.setItem("clipvault_floating_pos", JSON.stringify(pos));
    } catch { /* ignore */ }
  }, [pos]);

  // Keep inside screen bounds on resize
  useEffect(() => {
    const onResize = () => {
      setPos((prev) => {
        const maxX = Math.max(10, window.innerWidth - 68);
        const maxY = Math.max(10, window.innerHeight - 68);
        return {
          x: Math.min(Math.max(10, prev.x), maxX),
          y: Math.min(Math.max(10, prev.y), maxY),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Touch and Mouse Dragging
  const handleStart = (clientX: number, clientY: number) => {
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      posX: pos.x,
      posY: pos.y,
      moved: false,
    };
    setIsDragging(true);
  };

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 6) {
      dragStartRef.current.moved = true;
    }
    const maxX = Math.max(10, window.innerWidth - 68);
    const maxY = Math.max(10, window.innerHeight - 68);
    const newX = Math.min(Math.max(10, dragStartRef.current.posX + dx), maxX);
    const newY = Math.min(Math.max(10, dragStartRef.current.posY + dy), maxY);
    setPos({ x: newX, y: newY });
  }, [isDragging]);

  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    // If moved barely, consider it a tap!
    if (!dragStartRef.current.moved) {
      triggerHaptic(25);
      setIsOpen((prev) => !prev);
      return;
    }

    // Magnetic snap to nearest edge (left or right)
    const midX = window.innerWidth / 2;
    const snapX = pos.x < midX ? 14 : window.innerWidth - 72;
    setPos((p) => ({ ...p, x: snapX }));
  }, [isDragging, pos.x, triggerHaptic]);

  // Document-level listeners for dragging to prevent losing touch
  useEffect(() => {
    if (!isDragging) return;

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => handleEnd();

    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };
    const onMouseUp = () => handleEnd();

    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, handleMove, handleEnd]);

  // Submit quick add
  const handleQuickAddSubmit = async () => {
    const clean = quickAddText.trim();
    if (!clean) return;
    setIsSubmitting(true);
    try {
      await onQuickAdd(clean);
      setQuickAddText("");
      setQuickAddOpen(false);
      triggerHaptic(40);
    } catch { /* ignore */ } finally {
      setIsSubmitting(false);
    }
  };

  if (!enabled) return null;

  // Items for the Radial Menu (6 Items around 360 deg)
  const radialItems: RadialItem[] = [
    {
      id: "clipboard",
      labelAr: "الحافظة",
      labelEn: "Clipboard",
      icon: "clipboard",
      className: "clipboard",
      action: () => {
        triggerHaptic(20);
        onNavigate("list");
        setIsOpen(false);
      },
    },
    {
      id: "search",
      labelAr: "البحث",
      labelEn: "Search",
      icon: "search",
      className: "search",
      action: () => {
        triggerHaptic(20);
        onNavigate("list");
        onTriggerSearch();
        setIsOpen(false);
      },
    },
    {
      id: "vault",
      labelAr: "الخزينة",
      labelEn: "Vault",
      icon: "lock",
      className: "vault",
      action: () => {
        triggerHaptic(20);
        onNavigate("passwords");
        setIsOpen(false);
      },
    },
    {
      id: "typing",
      labelAr: "التدقيق",
      labelEn: "Typing",
      icon: "sparkles",
      className: "typing",
      action: () => {
        triggerHaptic(20);
        onNavigate("typing");
        setIsOpen(false);
      },
    },
    {
      id: "add",
      labelAr: "إضافة",
      labelEn: "New Item",
      icon: "edit",
      className: "add",
      action: () => {
        triggerHaptic(20);
        setIsOpen(false);
        setQuickAddOpen(true);
      },
    },
    {
      id: "settings",
      labelAr: "الإعدادات",
      labelEn: "Settings",
      icon: "settings",
      className: "settings",
      action: () => {
        triggerHaptic(20);
        onNavigate("settings");
        setIsOpen(false);
      },
    },
  ];

  // Radial menu radius in pixels
  const radius = 95;
  const orbCenter = { x: pos.x + 29, y: pos.y + 29 };

  return (
    <div className="floating-quick-access-root">
      {/* Backdrop when menu is open */}
      {isOpen && (
        <div
          className="radial-backdrop"
          onClick={() => {
            triggerHaptic(15);
            setIsOpen(false);
          }}
        />
      )}

      {/* Radial Menu Items */}
      {isOpen && (
        <div
          className="radial-menu-container"
          style={{
            left: `${orbCenter.x}px`,
            top: `${orbCenter.y}px`,
          }}
        >
          <div className="radial-central-ring" />

          {radialItems.map((item, idx) => {
            // Distribute 6 items symmetrically
            const angle = (idx * 60 - 90) * (Math.PI / 180);
            const itemX = Math.round(Math.cos(angle) * radius);
            const itemY = Math.round(Math.sin(angle) * radius);

            return (
              <button
                key={item.id}
                className={`radial-item-btn ${item.className}`}
                style={{
                  transform: `translate(${itemX - 26}px, ${itemY - 26}px)`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  item.action();
                }}
                title={lang === "ar" ? item.labelAr : item.labelEn}
              >
                <Icon name={item.icon} size={20} />
                <span className="radial-item-label">
                  {lang === "ar" ? item.labelAr : item.labelEn}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Floating Orb Main Handle */}
      <div
        className={`floating-orb${isDragging ? " dragging" : ""}${isOpen ? " open" : ""}`}
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        }}
        onTouchStart={(e) => {
          if (e.touches.length > 0) {
            handleStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onMouseDown={(e) => {
          handleStart(e.clientX, e.clientY);
        }}
        title={lang === "ar" ? "شريط الوصول السريع" : "Quick Access Orb"}
      >
        <div className="floating-orb-glow" />
        <div className="floating-orb-icon">
          <Icon name={isOpen ? "x" : "clipboard"} size={26} />
        </div>
        {!isOpen && totalItems > 0 && (
          <div className="floating-orb-badge">
            {totalItems > 99 ? "99+" : totalItems}
          </div>
        )}
      </div>

      {/* Quick Add Dialog */}
      {quickAddOpen && (
        <div
          className="radial-quick-add-modal"
          onClick={() => setQuickAddOpen(false)}
        >
          <div
            className="radial-quick-add-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              <Icon name="edit" size={18} />
              {lang === "ar" ? "إضافة نص جديد للحافظة" : "Add Text to Clipboard"}
            </h3>
            <textarea
              className="radial-quick-add-input"
              placeholder={lang === "ar" ? "اكتب أو الصق النص هنا..." : "Type or paste your text here..."}
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              autoFocus
            />
            <div className="radial-quick-add-actions">
              <button
                className="btn"
                onClick={() => setQuickAddOpen(false)}
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                className="btn primary"
                disabled={!quickAddText.trim() || isSubmitting}
                onClick={handleQuickAddSubmit}
              >
                {lang === "ar" ? "حفظ ونسخ" : "Save & Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
