import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { api, vaultApi } from "../api";
import type {
  PasswordGeneratorOptions,
  VaultAuditReport,
  VaultCategory,
  VaultItem,
  VaultItemInput,
  VaultStatus,
} from "../types";
import {
  generatePassphrase,
  generatePassword,
  getStrengthFeedback,
} from "../utils/passwordGenerator";

interface PasswordVaultProps {
  onNotify: (msg: string, err?: boolean) => void;
}

export function PasswordVault({ onNotify }: PasswordVaultProps) {
  // Vault state
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // Items state
  const [items, setItems] = useState<VaultItem[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<VaultCategory | "all" | "favorite">("all");
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  // Modals & Tools
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItemInput | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditReport, setAuditReport] = useState<VaultAuditReport | null>(null);

  // Generator Options State
  const [genOpts, setGenOpts] = useState<PasswordGeneratorOptions>({
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    avoidAmbiguous: true,
  });
  const [generatedPass, setGeneratedPass] = useState("");
  const [genMode, setGenMode] = useState<"random" | "passphrase">("random");

  // Auto-clear timers ref
  const clearTimersRef = useRef<Map<number, number>>(new Map());

  // Load vault status
  const refreshStatus = useCallback(async () => {
    try {
      const s = await vaultApi.getStatus();
      setStatus(s);
      if (!s.isLocked && s.isSetup) {
        const list = await vaultApi.getItems();
        setItems(list);
      }
    } catch (err) {
      onNotify(String(err), true);
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Unlock handler
  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput) return;
    setPinError(null);
    try {
      const s = await vaultApi.unlock(pinInput);
      setStatus(s);
      setPinInput("");
      const list = await vaultApi.getItems();
      setItems(list);
      onNotify("تم فتح خزينة كلمات المرور بأمان");
    } catch (err) {
      setPinError(String(err));
    }
  };

  // Setup master PIN handler
  const handleSetup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.length < 4) {
      setPinError("يجب أن يتكون رمز المرور من 4 خانات على الأقل");
      return;
    }
    if (pinInput !== confirmPinInput) {
      setPinError("رمزا المرور غير متطابقين");
      return;
    }
    setPinError(null);
    try {
      const s = await vaultApi.setupMaster(pinInput);
      setStatus(s);
      setPinInput("");
      setConfirmPinInput("");
      const list = await vaultApi.getItems();
      setItems(list);
      onNotify("تم إنشاء وتأمين القبو بنجاح!");
    } catch (err) {
      setPinError(String(err));
    }
  };

  // Lock handler
  const handleLock = async () => {
    try {
      const s = await vaultApi.lock();
      setStatus(s);
      setItems([]);
      setRevealedIds(new Set());
      onNotify("تم قفل الخزينة بنجاح");
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  // Toggle revealed password
  const toggleReveal = (id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Copy with auto-clear after 30s
  const copySecret = async (secret: string, label: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      onNotify(`تم نسخ ${label} (سيُمسح من الحافظة بعد 30 ثانية للأمان)`);

      // Set auto-clear
      setTimeout(() => {
        vaultApi.clearSecretFromClipboard(secret).catch(() => {});
      }, 30000);
    } catch {
      onNotify("فشل في نسخ النص", true);
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (id: number) => {
    try {
      const fav = await vaultApi.toggleFavorite(id);
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, favorite: fav } : it))
      );
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  // Delete item
  const handleDeleteItem = async (id: number) => {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا العنصر نهائياً؟")) return;
    try {
      await vaultApi.deleteItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      onNotify("تم حذف العنصر بنجاح");
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  // Save item (New or Edit)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.title.trim()) {
      onNotify("يرجى إدخال عنوان للعنصر", true);
      return;
    }
    try {
      const saved = await vaultApi.saveItem(editingItem);
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      setEditModalOpen(false);
      setEditingItem(null);
      onNotify("تم حفظ بيانات الحساب بنجاح");
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  // Run audit
  const handleOpenAudit = async () => {
    try {
      const rep = await vaultApi.audit();
      setAuditReport(rep);
      setAuditModalOpen(true);
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  // Generate password trigger
  const triggerGenerate = () => {
    if (genMode === "passphrase") {
      setGeneratedPass(generatePassphrase(4));
    } else {
      setGeneratedPass(generatePassword(genOpts));
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    let list = items;
    if (categoryFilter === "favorite") {
      list = list.filter((it) => it.favorite);
    } else if (categoryFilter !== "all") {
      list = list.filter((it) => it.category === categoryFilter);
    }

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          (it.username && it.username.toLowerCase().includes(q)) ||
          (it.website && it.website.toLowerCase().includes(q)) ||
          (it.notes && it.notes.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, categoryFilter, query]);

  if (loading) {
    return (
      <div className="vault-loading-container">
        <div className="vault-spinner" />
        <span>جارٍ تجهيز الخزينة المشفرة...</span>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 1: Setup Master PIN
  // -------------------------------------------------------------
  if (!status?.isSetup) {
    return (
      <div className="vault-lock-screen">
        <div className="vault-lock-card animate-in">
          <div className="vault-lock-icon setup-glow">
            <Icon name="shieldCheck" size={44} />
          </div>
          <h2 className="vault-lock-title">إنشاء خزينة كلمات المرور</h2>
          <p className="vault-lock-desc">
            قم بتعيين رمز مرور رئيسي (PIN أو كلمة سر). تُشفر بياناتك محلياً 100% بخوارزمية{" "}
            <strong>AES-256-GCM</strong> ولا يمكن لأحد فتحها بدون هذا الرمز.
          </p>

          <form onSubmit={handleSetup} className="vault-form">
            <div className="vault-input-group">
              <label>رمز المرور الرئيسي الجديد</label>
              <input
                type="password"
                placeholder="أدخل 4 خانات على الأقل..."
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                className="vault-text-input"
              />
            </div>

            <div className="vault-input-group">
              <label>تأكيد رمز المرور</label>
              <input
                type="password"
                placeholder="أعد إدخال الرمز لتأكيده..."
                value={confirmPinInput}
                onChange={(e) => setConfirmPinInput(e.target.value)}
                className="vault-text-input"
              />
            </div>

            {pinError && <div className="vault-error-msg">{pinError}</div>}

            <button type="submit" className="vault-primary-btn">
              <Icon name="lock" size={16} />
              <span>تأمين وإنشاء الخزينة</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 2: Locked Screen (PIN Entry)
  // -------------------------------------------------------------
  if (status.isLocked) {
    return (
      <div className="vault-lock-screen">
        <div className="vault-lock-card animate-in">
          <div className="vault-lock-icon locked-glow">
            <Icon name="lock" size={40} />
          </div>
          <h2 className="vault-lock-title">الخزينة مقفلة بأمان</h2>
          <p className="vault-lock-desc">
            أدخل رمز المرور لفك تشفير وعرض حساباتك وكلمات مرورك المحمية.
          </p>

          <form onSubmit={handleUnlock} className="vault-form">
            <div className="vault-input-group">
              <input
                type="password"
                placeholder="أدخل رمز المرور..."
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                className="vault-text-input pin-entry"
              />
            </div>

            {pinError && <div className="vault-error-msg">{pinError}</div>}

            <button type="submit" className="vault-primary-btn">
              <Icon name="unlock" size={16} />
              <span>فتح الخزينة</span>
            </button>
          </form>

          <div className="vault-lock-stats">
            <span>محفوظات مشفرة: {status.totalItems} عنصر</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 3: Unlocked Vault Main Dashboard
  // -------------------------------------------------------------
  return (
    <div className="vault-dashboard">
      {/* Top Vault Actions Bar */}
      <div className="vault-topbar">
        {/* Search Input */}
        <div className="vault-search-wrap">
          <Icon name="search" size={15} className="vault-search-ico" />
          <input
            type="text"
            placeholder="بحث في الحسابات، المواقع، الملاحظات..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="vault-search-input"
          />
          {query && (
            <button className="vault-clear-search" onClick={() => setQuery("")}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="vault-actions-group">
          <button
            className="vault-btn vault-btn-primary"
            onClick={() => {
              setEditingItem({
                category: "login",
                title: "",
                username: "",
                password: "",
                website: "",
                notes: "",
                favorite: false,
              });
              setEditModalOpen(true);
            }}
            title="إضافة حساب أو بطاقة جديدة"
          >
            <Icon name="plus" size={15} />
            <span>عنصر جديد</span>
          </button>

          <button
            className="vault-btn"
            onClick={() => {
              triggerGenerate();
              setGeneratorOpen(true);
            }}
            title="مولد كلمات مرور احترافي"
          >
            <Icon name="sparkles" size={14} />
            <span>مولد المرور</span>
          </button>

          <button
            className="vault-btn"
            onClick={handleOpenAudit}
            title="فحص أمان وصحة كلمات المرور"
          >
            <Icon name="shield" size={14} />
            <span>فحص الأمان</span>
          </button>

          <button
            className="vault-btn vault-lock-btn"
            onClick={handleLock}
            title="قفل الخزينة فوراً"
          >
            <Icon name="lock" size={14} />
            <span>قفل الآن</span>
          </button>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="vault-categories-bar">
        <button
          className={`vault-cat-pill${categoryFilter === "all" ? " active" : ""}`}
          onClick={() => setCategoryFilter("all")}
        >
          <Icon name="grid" size={12} />
          <span>الكل ({items.length})</span>
        </button>
        <button
          className={`vault-cat-pill${categoryFilter === "login" ? " active" : ""}`}
          onClick={() => setCategoryFilter("login")}
        >
          <Icon name="key" size={12} />
          <span>حسابات ({items.filter((i) => i.category === "login").length})</span>
        </button>
        <button
          className={`vault-cat-pill${categoryFilter === "card" ? " active" : ""}`}
          onClick={() => setCategoryFilter("card")}
        >
          <Icon name="creditCard" size={12} />
          <span>بطاقات دفع ({items.filter((i) => i.category === "card").length})</span>
        </button>
        <button
          className={`vault-cat-pill${categoryFilter === "note" ? " active" : ""}`}
          onClick={() => setCategoryFilter("note")}
        >
          <Icon name="fileText" size={12} />
          <span>ملاحظات سرية ({items.filter((i) => i.category === "note").length})</span>
        </button>
        <button
          className={`vault-cat-pill${categoryFilter === "favorite" ? " active" : ""}`}
          onClick={() => setCategoryFilter("favorite")}
        >
          <Icon name="star" size={12} />
          <span>المفضلة ({items.filter((i) => i.favorite).length})</span>
        </button>
      </div>

      {/* Vault Items Grid */}
      {filteredItems.length === 0 ? (
        <div className="vault-empty">
          <div className="vault-empty-icon">
            <Icon name="shield" size={44} />
          </div>
          <h3>{query ? "لا توجد نتائج مطابقة لبحثك" : "لا توجد عناصر في هذا القسم بعد"}</h3>
          <p>
            {query
              ? "جرّب كلمات بحث أخرى أو امسح الفلتر"
              : "اضغط على «عنصر جديد» لإضافة وتأمين أول حساب أو بطاقة في الخزينة."}
          </p>
        </div>
      ) : (
        <div className="vault-grid">
          {filteredItems.map((it) => {
            const isRevealed = revealedIds.has(it.id);
            const strength = getStrengthFeedback(it.strength);

            return (
              <div key={it.id} className="vault-card animate-in">
                {/* Card Header */}
                <div className="vault-card-header">
                  <div className="vault-card-title-group">
                    <div className="vault-type-badge">
                      <Icon
                        name={
                          it.category === "login"
                            ? "key"
                            : it.category === "card"
                            ? "creditCard"
                            : "fileText"
                        }
                        size={13}
                      />
                    </div>
                    <div className="vault-card-titles">
                      <h4 className="vault-card-title">{it.title}</h4>
                      {it.username && (
                        <div className="vault-card-sub">
                          <span>{it.username}</span>
                          <button
                            className="vault-inline-copy"
                            onClick={() => copySecret(it.username!, "اسم المستخدم")}
                            title="نسخ اسم المستخدم"
                          >
                            <Icon name="copy" size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="vault-card-actions-top">
                    <button
                      className={`vault-icon-btn${it.favorite ? " is-fav" : ""}`}
                      onClick={() => handleToggleFavorite(it.id)}
                      title={it.favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
                    >
                      <Icon name="star" size={14} filled={it.favorite} />
                    </button>
                    {it.website && (
                      <button
                        className="vault-icon-btn"
                        onClick={() => api.openExternalUrl(it.website!)}
                        title="فتح الموقع في المتصفح"
                      >
                        <Icon name="external" size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Password / Card Details Row */}
                {it.category === "login" && it.password && (
                  <div className="vault-password-box">
                    <div className="vault-pass-display">
                      {isRevealed ? it.password : "••••••••••••"}
                    </div>
                    <div className="vault-pass-actions">
                      <button
                        className="vault-icon-btn"
                        onClick={() => toggleReveal(it.id)}
                        title={isRevealed ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                      >
                        <Icon name={isRevealed ? "eyeOff" : "eye"} size={13} />
                      </button>
                      <button
                        className="vault-icon-btn"
                        onClick={() => copySecret(it.password!, "كلمة المرور")}
                        title="نسخ كلمة المرور بأمان"
                      >
                        <Icon name="copy" size={13} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Card Specific Details */}
                {it.category === "card" && (
                  <div className="vault-card-payment-info">
                    {it.cardNumber && (
                      <div className="vault-card-num-row">
                        <span>{isRevealed ? it.cardNumber : "•••• •••• •••• " + it.cardNumber.slice(-4)}</span>
                        <button
                          className="vault-inline-copy"
                          onClick={() => copySecret(it.cardNumber!, "رقم البطاقة")}
                        >
                          <Icon name="copy" size={11} />
                        </button>
                      </div>
                    )}
                    <div className="vault-card-meta-row">
                      {it.cardExpiry && <span>الانتهاء: {it.cardExpiry}</span>}
                      {it.cardCvv && <span>CVV: {isRevealed ? it.cardCvv : "•••"}</span>}
                      <button
                        className="vault-icon-btn"
                        onClick={() => toggleReveal(it.id)}
                        title={isRevealed ? "إخفاء" : "إظهار"}
                      >
                        <Icon name={isRevealed ? "eyeOff" : "eye"} size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Note excerpt */}
                {it.category === "note" && it.notes && (
                  <div className="vault-note-preview">{it.notes}</div>
                )}

                {/* Strength Meter (for logins) */}
                {it.category === "login" && it.password && (
                  <div className="vault-strength-indicator">
                    <div
                      className="vault-strength-bar"
                      style={{
                        width: `${strength.percent}%`,
                        backgroundColor: strength.color,
                      }}
                    />
                    <span style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                )}

                {/* Footer Controls */}
                <div className="vault-card-footer">
                  <span className="vault-card-date">
                    {new Date(it.updatedAt).toLocaleDateString("ar-EG")}
                  </span>
                  <div className="vault-footer-btns">
                    <button
                      className="vault-sm-btn"
                      onClick={() => {
                        setEditingItem({
                          id: it.id,
                          category: it.category,
                          title: it.title,
                          username: it.username,
                          password: it.password,
                          website: it.website,
                          notes: it.notes,
                          cardNumber: it.cardNumber,
                          cardExpiry: it.cardExpiry,
                          cardCvv: it.cardCvv,
                          favorite: it.favorite,
                        });
                        setEditModalOpen(true);
                      }}
                      title="تعديل بيانات الحساب"
                    >
                      <Icon name="edit" size={12} />
                      <span>تعديل</span>
                    </button>
                    <button
                      className="vault-sm-btn danger"
                      onClick={() => handleDeleteItem(it.id)}
                      title="حذف العنصر"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------------- */}
      {/* MODAL 1: Add / Edit Item Modal                              */}
      {/* ----------------------------------------------------------- */}
      {editModalOpen && editingItem && (
        <div className="vault-modal-backdrop animate-in" onClick={() => setEditModalOpen(false)}>
          <div className="vault-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="vault-modal-header">
              <h3>{editingItem.id ? "تعديل العنصر المحمي" : "إضافة عنصر جديد في الخزينة"}</h3>
              <button className="vault-modal-close" onClick={() => setEditModalOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="vault-modal-body">
              {/* Category Selector */}
              <div className="vault-form-row">
                <label>نوع العنصر</label>
                <div className="vault-cat-toggle-row">
                  <button
                    type="button"
                    className={`vault-cat-choice${editingItem.category === "login" ? " active" : ""}`}
                    onClick={() => setEditingItem({ ...editingItem, category: "login" })}
                  >
                    <Icon name="key" size={13} />
                    <span>حساب موقع / تطبيق</span>
                  </button>
                  <button
                    type="button"
                    className={`vault-cat-choice${editingItem.category === "card" ? " active" : ""}`}
                    onClick={() => setEditingItem({ ...editingItem, category: "card" })}
                  >
                    <Icon name="creditCard" size={13} />
                    <span>بطاقة دفع</span>
                  </button>
                  <button
                    type="button"
                    className={`vault-cat-choice${editingItem.category === "note" ? " active" : ""}`}
                    onClick={() => setEditingItem({ ...editingItem, category: "note" })}
                  >
                    <Icon name="fileText" size={13} />
                    <span>ملاحظة مشفرة</span>
                  </button>
                </div>
              </div>

              {/* Title Field */}
              <div className="vault-form-row">
                <label>العنوان / اسم الخدمة *</label>
                <input
                  type="text"
                  placeholder="مثال: Google, GitHub, Netflix..."
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  required
                  className="vault-text-input"
                />
              </div>

              {/* Login Fields */}
              {editingItem.category === "login" && (
                <>
                  <div className="vault-form-row">
                    <label>اسم المستخدم / البريد الإلكتروني</label>
                    <input
                      type="text"
                      placeholder="user@example.com"
                      value={editingItem.username ?? ""}
                      onChange={(e) => setEditingItem({ ...editingItem, username: e.target.value })}
                      className="vault-text-input"
                    />
                  </div>

                  <div className="vault-form-row">
                    <div className="vault-row-between">
                      <label>كلمة المرور</label>
                      <button
                        type="button"
                        className="vault-link-btn"
                        onClick={() => {
                          const generated = generatePassword(genOpts);
                          setEditingItem({ ...editingItem, password: generated });
                          onNotify("تم توليد كلمة مرور قوية وتعبئتها");
                        }}
                      >
                        <Icon name="sparkles" size={11} />
                        <span>توليد كلمة قوية</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="أدخل كلمة المرور أو ولّد واحدة قوية..."
                      value={editingItem.password ?? ""}
                      onChange={(e) => setEditingItem({ ...editingItem, password: e.target.value })}
                      className="vault-text-input"
                    />
                  </div>

                  <div className="vault-form-row">
                    <label>رابط الموقع (اختياري)</label>
                    <input
                      type="url"
                      placeholder="https://example.com/login"
                      value={editingItem.website ?? ""}
                      onChange={(e) => setEditingItem({ ...editingItem, website: e.target.value })}
                      className="vault-text-input"
                    />
                  </div>
                </>
              )}

              {/* Payment Card Fields */}
              {editingItem.category === "card" && (
                <>
                  <div className="vault-form-row">
                    <label>رقم البطاقة</label>
                    <input
                      type="text"
                      placeholder="0000 0000 0000 0000"
                      value={editingItem.cardNumber ?? ""}
                      onChange={(e) => setEditingItem({ ...editingItem, cardNumber: e.target.value })}
                      className="vault-text-input"
                    />
                  </div>
                  <div className="vault-form-two-col">
                    <div className="vault-form-row">
                      <label>تاريخ الانتهاء</label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        value={editingItem.cardExpiry ?? ""}
                        onChange={(e) => setEditingItem({ ...editingItem, cardExpiry: e.target.value })}
                        className="vault-text-input"
                      />
                    </div>
                    <div className="vault-form-row">
                      <label>رمز الأمان (CVV)</label>
                      <input
                        type="password"
                        placeholder="123"
                        maxLength={4}
                        value={editingItem.cardCvv ?? ""}
                        onChange={(e) => setEditingItem({ ...editingItem, cardCvv: e.target.value })}
                        className="vault-text-input"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Notes Field */}
              <div className="vault-form-row">
                <label>ملاحظات مشفرة إضافية (اختياري)</label>
                <textarea
                  placeholder="أي معلومات حساسة أخرى..."
                  value={editingItem.notes ?? ""}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                  className="vault-textarea"
                  rows={3}
                />
              </div>

              {/* Modal Buttons */}
              <div className="vault-modal-footer">
                <button type="button" className="vault-btn" onClick={() => setEditModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" className="vault-btn vault-btn-primary">
                  <Icon name="check" size={14} />
                  <span>حفظ العنصر المشفر</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- */}
      {/* MODAL 2: Advanced Password Generator Modal                  */}
      {/* ----------------------------------------------------------- */}
      {generatorOpen && (
        <div className="vault-modal-backdrop animate-in" onClick={() => setGeneratorOpen(false)}>
          <div className="vault-modal-box gen-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vault-modal-header">
              <h3>مولد كلمات المرور الاحترافي</h3>
              <button className="vault-modal-close" onClick={() => setGeneratorOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="vault-modal-body">
              {/* Output & Copy Box */}
              <div className="vault-gen-result-box">
                <div className="vault-gen-string">{generatedPass}</div>
                <div className="vault-gen-actions">
                  <button className="vault-icon-btn" onClick={triggerGenerate} title="إعادة التوليد">
                    <Icon name="refresh" size={16} />
                  </button>
                  <button
                    className="vault-icon-btn primary"
                    onClick={() => copySecret(generatedPass, "كلمة المرور المولدة")}
                    title="نسخ فوري"
                  >
                    <Icon name="copy" size={16} />
                  </button>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="vault-cat-toggle-row">
                <button
                  className={`vault-cat-choice${genMode === "random" ? " active" : ""}`}
                  onClick={() => {
                    setGenMode("random");
                    setGeneratedPass(generatePassword(genOpts));
                  }}
                >
                  أحرف ورموز عشوائية
                </button>
                <button
                  className={`vault-cat-choice${genMode === "passphrase" ? " active" : ""}`}
                  onClick={() => {
                    setGenMode("passphrase");
                    setGeneratedPass(generatePassphrase(4));
                  }}
                >
                  عبارة مرور سهلة الحفظ
                </button>
              </div>

              {genMode === "random" ? (
                <>
                  {/* Length Slider */}
                  <div className="vault-slider-row">
                    <div className="vault-row-between">
                      <label>الطول: {genOpts.length} حرفاً</label>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={48}
                      value={genOpts.length}
                      onChange={(e) => {
                        const next = { ...genOpts, length: Number(e.target.value) };
                        setGenOpts(next);
                        setGeneratedPass(generatePassword(next));
                      }}
                      className="vault-range-slider"
                    />
                  </div>

                  {/* Checkboxes */}
                  <div className="vault-gen-checkboxes">
                    <label className="vault-check-label">
                      <input
                        type="checkbox"
                        checked={genOpts.uppercase}
                        onChange={(e) => {
                          const next = { ...genOpts, uppercase: e.target.checked };
                          setGenOpts(next);
                          setGeneratedPass(generatePassword(next));
                        }}
                      />
                      <span>أحرف كبيرة (A-Z)</span>
                    </label>
                    <label className="vault-check-label">
                      <input
                        type="checkbox"
                        checked={genOpts.lowercase}
                        onChange={(e) => {
                          const next = { ...genOpts, lowercase: e.target.checked };
                          setGenOpts(next);
                          setGeneratedPass(generatePassword(next));
                        }}
                      />
                      <span>أحرف صغيرة (a-z)</span>
                    </label>
                    <label className="vault-check-label">
                      <input
                        type="checkbox"
                        checked={genOpts.numbers}
                        onChange={(e) => {
                          const next = { ...genOpts, numbers: e.target.checked };
                          setGenOpts(next);
                          setGeneratedPass(generatePassword(next));
                        }}
                      />
                      <span>أرقام (0-9)</span>
                    </label>
                    <label className="vault-check-label">
                      <input
                        type="checkbox"
                        checked={genOpts.symbols}
                        onChange={(e) => {
                          const next = { ...genOpts, symbols: e.target.checked };
                          setGenOpts(next);
                          setGeneratedPass(generatePassword(next));
                        }}
                      />
                      <span>رموز خاصة (!@#$%)</span>
                    </label>
                    <label className="vault-check-label">
                      <input
                        type="checkbox"
                        checked={genOpts.avoidAmbiguous}
                        onChange={(e) => {
                          const next = { ...genOpts, avoidAmbiguous: e.target.checked };
                          setGenOpts(next);
                          setGeneratedPass(generatePassword(next));
                        }}
                      />
                      <span>تجنب الرموز المتشابهة (0, O, l, 1)</span>
                    </label>
                  </div>
                </>
              ) : (
                <div className="vault-passphrase-info">
                  <p>تتكون عبارة المرور من 4 كلمات بالإنجليزية يسهل تذكرها مع فواصل آمنة.</p>
                  <button className="vault-btn" onClick={() => setGeneratedPass(generatePassphrase(4))}>
                    <Icon name="refresh" size={13} />
                    <span>توليد عبارة جديدة</span>
                  </button>
                </div>
              )}

              <div className="vault-modal-footer">
                <button
                  type="button"
                  className="vault-btn vault-btn-primary"
                  onClick={() => {
                    copySecret(generatedPass, "كلمة المرور");
                    setGeneratorOpen(false);
                  }}
                >
                  <Icon name="copy" size={14} />
                  <span>نسخ وإغلاق</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- */}
      {/* MODAL 3: Security Audit Report Modal                        */}
      {/* ----------------------------------------------------------- */}
      {auditModalOpen && auditReport && (
        <div className="vault-modal-backdrop animate-in" onClick={() => setAuditModalOpen(false)}>
          <div className="vault-modal-box audit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vault-modal-header">
              <h3>تقرير فحص أمان كلمات المرور</h3>
              <button className="vault-modal-close" onClick={() => setAuditModalOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="vault-modal-body">
              <div className="vault-audit-summary-grid">
                <div className="vault-audit-card strong">
                  <div className="audit-num">{auditReport.strongCount}</div>
                  <div className="audit-label">كلمات قوية وآمنة</div>
                </div>
                <div className="vault-audit-card weak">
                  <div className="audit-num">{auditReport.weakCount}</div>
                  <div className="audit-label">كلمات ضعيفة</div>
                </div>
                <div className="vault-audit-card reused">
                  <div className="audit-num">{auditReport.reusedCount}</div>
                  <div className="audit-label">كلمات مكررة</div>
                </div>
              </div>

              {auditReport.weakCount === 0 && auditReport.reusedCount === 0 ? (
                <div className="vault-audit-perfect">
                  <Icon name="shieldCheck" size={40} />
                  <h4>خزينتك بأعلى درجات الأمان!</h4>
                  <p>جميع كلمات مرورك قوية، فريدة، وغير مكررة عبر أي حسابات.</p>
                </div>
              ) : (
                <div className="vault-audit-alerts">
                  {auditReport.weakCount > 0 && (
                    <div className="vault-audit-alert weak">
                      <Icon name="alertTriangle" size={16} />
                      <span>
                        لديك <strong>{auditReport.weakCount}</strong> كلمة مرور ضعيفة يُنصح بتغييرها فوراً.
                      </span>
                    </div>
                  )}
                  {auditReport.reusedCount > 0 && (
                    <div className="vault-audit-alert reused">
                      <Icon name="alertTriangle" size={16} />
                      <span>
                        لديك <strong>{auditReport.reusedCount}</strong> حساباً يستخدم نفس كلمة المرور!
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="vault-modal-footer">
                <button
                  type="button"
                  className="vault-btn vault-btn-primary"
                  onClick={() => setAuditModalOpen(false)}
                >
                  فهمت ذلك
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
