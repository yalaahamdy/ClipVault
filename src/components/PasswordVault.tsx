import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { api, vaultApi } from "../api";
import { useI18n } from "../i18n";
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
  onItemCountChange?: (count: number) => void;
}

export function PasswordVault({ onNotify, onItemCountChange }: PasswordVaultProps) {
  const { t, lang } = useI18n();

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

  // CSV Import / Export
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);

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

  useEffect(() => {
    onItemCountChange?.(items.length);
  }, [items.length, onItemCountChange]);

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
      onNotify(t("vault.toast.unlocked"));
    } catch (err) {
      setPinError(String(err));
    }
  };

  // Setup master PIN handler
  const handleSetup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.length < 4) {
      setPinError(t("vault.error.pinShort"));
      return;
    }
    if (pinInput !== confirmPinInput) {
      setPinError(t("vault.error.pinMismatch"));
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
      onNotify(t("vault.toast.setupDone"));
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
      onNotify(t("vault.toast.locked"));
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
      onNotify(t("vault.toast.copied", { label }));

      // Set auto-clear
      setTimeout(() => {
        vaultApi.clearSecretFromClipboard(secret).catch(() => {});
      }, 30000);
    } catch {
      onNotify(t("vault.toast.copyFailed"), true);
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
    if (!confirm(t("vault.confirm.delete"))) return;
    try {
      await vaultApi.deleteItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      onNotify(t("vault.toast.deleted"));
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  // Save item (New or Edit)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.title.trim()) {
      onNotify(t("vault.toast.titleRequired"), true);
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
      onNotify(t("vault.toast.saved"));
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

  // Export CSV handler
  const handleExportCsv = async () => {
    try {
      const csv = await vaultApi.exportCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ClipVault_Chrome_Passwords_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify(t("vault.toast.exported"));
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  // Close any open modal with Escape (consistent with the rest of the app)
  useEffect(() => {
    const anyOpen = editModalOpen || generatorOpen || auditModalOpen || importModalOpen;
    if (!anyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setEditModalOpen(false);
      setGeneratorOpen(false);
      setAuditModalOpen(false);
      if (!importing) setImportModalOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [editModalOpen, generatorOpen, auditModalOpen, importModalOpen, importing]);

  // Direct import of local file
  const handleDirectImportChrome = async () => {
    setImporting(true);
    try {
      const count = await vaultApi.importFromFile("D:\\Downloads\\ClipVault-source\\Chrome Passwords.csv");
      const list = await vaultApi.getItems();
      setItems(list);
      setImportModalOpen(false);
      onNotify(t("vault.toast.importedChrome", { count }));
    } catch (err) {
      onNotify(String(err), true);
    } finally {
      setImporting(false);
    }
  };

  // File picker import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      setImporting(true);
      try {
        const count = await vaultApi.importCsv(text);
        const list = await vaultApi.getItems();
        setItems(list);
        setImportModalOpen(false);
        onNotify(t("vault.toast.importedCsv", { count }));
      } catch (err) {
        onNotify(String(err), true);
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file, "UTF-8");
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
        <span>{t("vault.loading")}</span>
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
          <h2 className="vault-lock-title">{t("vault.setup.title")}</h2>
          <p className="vault-lock-desc">
            {t("vault.setup.desc1")}{" "}
            <strong>AES-256-GCM</strong> {t("vault.setup.desc2")}
          </p>

          <form onSubmit={handleSetup} className="vault-form">
            <div className="vault-input-group">
              <label>{t("vault.setup.newPin")}</label>
              <input
                type="password"
                placeholder={t("vault.setup.newPinPh")}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                className="vault-text-input"
              />
            </div>

            <div className="vault-input-group">
              <label>{t("vault.setup.confirmPin")}</label>
              <input
                type="password"
                placeholder={t("vault.setup.confirmPinPh")}
                value={confirmPinInput}
                onChange={(e) => setConfirmPinInput(e.target.value)}
                className="vault-text-input"
              />
            </div>

            {pinError && <div className="vault-error-msg">{pinError}</div>}

            <button type="submit" className="vault-primary-btn">
              <Icon name="lock" size={16} />
              <span>{t("vault.setup.cta")}</span>
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
          <h2 className="vault-lock-title">{t("vault.lock.title")}</h2>
          <p className="vault-lock-desc">
            {t("vault.lock.desc")}
          </p>

          <form onSubmit={handleUnlock} className="vault-form">
            <div className="vault-input-group">
              <input
                type="password"
                placeholder={t("vault.lock.pinPh")}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                className="vault-text-input pin-entry"
              />
            </div>

            {pinError && <div className="vault-error-msg">{pinError}</div>}

            <button type="submit" className="vault-primary-btn">
              <Icon name="unlock" size={16} />
              <span>{t("vault.lock.cta")}</span>
            </button>
          </form>

          <div className="vault-lock-stats">
            <span>{t("vault.lock.stats", { count: status.totalItems })}</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 3: Unlocked Vault Main Dashboard
  // -------------------------------------------------------------
  return (
    <main className="vault-dashboard">
      {/* 1. Top Search & Quick Actions Bar */}
      <div className="vault-search-row">
        <div className="vault-search-wrap">
          <Icon name="search" size={15} className="vault-search-ico" />
          <input
            type="text"
            placeholder={t("vault.action.searchPh")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="vault-search-input"
          />
          {query && (
            <button className="vault-clear-search" onClick={() => setQuery("")} title={t("vault.action.clearTitle")}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>

        <button
          className="vault-primary-action-btn"
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
          title={t("vault.action.newTitle")}
        >
          <Icon name="plus" size={15} />
          <span>{t("vault.action.new")}</span>
        </button>

        <button
          className="vault-lock-quick-btn"
          onClick={handleLock}
          title={t("vault.action.lockTitle")}
        >
          <Icon name="lock" size={13} />
          <span>{t("vault.action.lock")}</span>
        </button>
      </div>

      {/* 2. Scrollable Subnav Bar for Categories & Tools */}
      <nav
        className="vault-subnav-scroll"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
        tabIndex={0}
      >
        <button
          className={`chip${categoryFilter === "all" ? " active" : ""}`}
          onClick={() => setCategoryFilter("all")}
          title={t("vault.cat.allTitle")}
        >
          <Icon name="grid" size={12} />
          <span>{t("vault.cat.all")}</span>
          <span className="chip-counter">{items.length}</span>
        </button>

        <button
          className={`chip${categoryFilter === "login" ? " active" : ""}`}
          onClick={() => setCategoryFilter("login")}
          title={t("vault.cat.loginTitle")}
        >
          <Icon name="key" size={12} />
          <span>{t("vault.cat.login")}</span>
          <span className="chip-counter">{items.filter((i) => i.category === "login").length}</span>
        </button>

        <button
          className={`chip${categoryFilter === "card" ? " active" : ""}`}
          onClick={() => setCategoryFilter("card")}
          title={t("vault.cat.cardTitle")}
        >
          <Icon name="creditCard" size={12} />
          <span>{t("vault.cat.card")}</span>
          <span className="chip-counter">{items.filter((i) => i.category === "card").length}</span>
        </button>

        <button
          className={`chip${categoryFilter === "note" ? " active" : ""}`}
          onClick={() => setCategoryFilter("note")}
          title={t("vault.cat.noteTitle")}
        >
          <Icon name="fileText" size={12} />
          <span>{t("vault.cat.note")}</span>
          <span className="chip-counter">{items.filter((i) => i.category === "note").length}</span>
        </button>

        <button
          className={`chip${categoryFilter === "favorite" ? " active" : ""}`}
          onClick={() => setCategoryFilter("favorite")}
          title={t("vault.cat.favTitle")}
        >
          <Icon name="star" size={12} filled={categoryFilter === "favorite"} />
          <span>{t("vault.cat.fav")}</span>
          <span className="chip-counter">{items.filter((i) => i.favorite).length}</span>
        </button>

        <div className="vault-subnav-divider" />

        <button
          className="chip vault-tool-chip"
          onClick={() => {
            triggerGenerate();
            setGeneratorOpen(true);
          }}
          title={t("vault.tool.genTitle")}
        >
          <Icon name="sparkles" size={12} />
          <span>{t("vault.tool.gen")}</span>
        </button>

        <button
          className="chip vault-tool-chip"
          onClick={handleOpenAudit}
          title={t("vault.tool.auditTitle")}
        >
          <Icon name="shield" size={12} />
          <span>{t("vault.tool.audit")}</span>
        </button>

        <button
          className="chip vault-tool-chip"
          onClick={() => setImportModalOpen(true)}
          title={t("vault.tool.importTitle")}
        >
          <Icon name="upload" size={12} />
          <span>{t("vault.tool.import")}</span>
        </button>

        <button
          className="chip vault-tool-chip"
          onClick={handleExportCsv}
          title={t("vault.tool.exportTitle")}
        >
          <Icon name="download" size={12} />
          <span>{t("vault.tool.export")}</span>
        </button>
      </nav>

      {/* Vault Items Grid */}
      {filteredItems.length === 0 ? (
        <div className="vault-empty">
          <div className="vault-empty-icon">
            <Icon name="shield" size={44} />
          </div>
          <h3>{query ? t("vault.empty.noResults") : t("vault.empty.none")}</h3>
          <p>
            {query
              ? t("vault.empty.noResultsHint")
              : t("vault.empty.hint")}
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
                    <div className={`vault-type-badge ${it.category}`}>
                      <Icon
                        name={
                          it.category === "login"
                            ? "key"
                            : it.category === "card"
                            ? "creditCard"
                            : "fileText"
                        }
                        size={14}
                      />
                    </div>
                    <div className="vault-card-titles">
                      <h4 className="vault-card-title">{it.title}</h4>
                      {it.username && (
                        <div className="vault-card-sub">
                          <span>{it.username}</span>
                          <button
                            className="vault-inline-copy"
                            onClick={() => copySecret(it.username!, t("vault.label.username"))}
                            title={t("vault.card.copyUsername")}
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
                      title={it.favorite ? t("vault.card.unfavorite") : t("vault.card.favorite")}
                    >
                      <Icon name="star" size={14} filled={it.favorite} />
                    </button>
                    {it.website && (
                      <button
                        className="vault-icon-btn"
                        onClick={() => api.openExternalUrl(it.website!)}
                        title={t("vault.card.openWebsite")}
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
                        title={isRevealed ? t("vault.card.hidePassword") : t("vault.card.showPassword")}
                      >
                        <Icon name={isRevealed ? "eyeOff" : "eye"} size={13} />
                      </button>
                      <button
                        className="vault-icon-btn"
                        onClick={() => copySecret(it.password!, t("vault.label.password"))}
                        title={t("vault.card.copyPassword")}
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
                          onClick={() => copySecret(it.cardNumber!, t("vault.label.cardNumber"))}
                        >
                          <Icon name="copy" size={11} />
                        </button>
                      </div>
                    )}
                    <div className="vault-card-meta-row">
                      {it.cardExpiry && <span>{t("vault.card.expiry", { value: it.cardExpiry })}</span>}
                      {it.cardCvv && <span>CVV: {isRevealed ? it.cardCvv : "•••"}</span>}
                      <button
                        className="vault-icon-btn"
                        onClick={() => toggleReveal(it.id)}
                        title={isRevealed ? t("vault.card.hide") : t("vault.card.show")}
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
                    <div className="vault-strength-track">
                      <div
                        className="vault-strength-bar"
                        style={{
                          width: `${strength.percent}%`,
                          backgroundColor: strength.color,
                        }}
                      />
                    </div>
                    <span style={{ color: strength.color }}>{t(strength.labelKey)}</span>
                  </div>
                )}

                {/* Footer Controls */}
                <div className="vault-card-footer">
                  <span className="vault-card-date">
                    {new Date(it.updatedAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
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
                      title={t("vault.card.editTitle")}
                    >
                      <Icon name="edit" size={12} />
                      <span>{t("vault.card.edit")}</span>
                    </button>
                    <button
                      className="vault-sm-btn danger"
                      onClick={() => handleDeleteItem(it.id)}
                      title={t("vault.card.deleteTitle")}
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
              <h3>{editingItem.id ? t("vault.edit.titleEdit") : t("vault.edit.titleNew")}</h3>
              <button className="vault-modal-close" onClick={() => setEditModalOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="vault-modal-body">
              {/* Category Selector */}
              <div className="vault-form-row">
                <label>{t("vault.edit.type")}</label>
                <div className="vault-cat-toggle-row">
                  <button
                    type="button"
                    className={`vault-cat-choice${editingItem.category === "login" ? " active" : ""}`}
                    onClick={() => setEditingItem({ ...editingItem, category: "login" })}
                  >
                    <Icon name="key" size={13} />
                    <span>{t("vault.edit.catLogin")}</span>
                  </button>
                  <button
                    type="button"
                    className={`vault-cat-choice${editingItem.category === "card" ? " active" : ""}`}
                    onClick={() => setEditingItem({ ...editingItem, category: "card" })}
                  >
                    <Icon name="creditCard" size={13} />
                    <span>{t("vault.edit.catCard")}</span>
                  </button>
                  <button
                    type="button"
                    className={`vault-cat-choice${editingItem.category === "note" ? " active" : ""}`}
                    onClick={() => setEditingItem({ ...editingItem, category: "note" })}
                  >
                    <Icon name="fileText" size={13} />
                    <span>{t("vault.edit.catNote")}</span>
                  </button>
                </div>
              </div>

              {/* Title Field */}
              <div className="vault-form-row">
                <label>{t("vault.edit.titleLabel")}</label>
                <input
                  type="text"
                  placeholder={t("vault.edit.titlePh")}
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
                    <label>{t("vault.edit.username")}</label>
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
                      <label>{t("vault.edit.password")}</label>
                      <button
                        type="button"
                        className="vault-link-btn"
                        onClick={() => {
                          const generated = generatePassword(genOpts);
                          setEditingItem({ ...editingItem, password: generated });
                          onNotify(t("vault.toast.generated"));
                        }}
                      >
                        <Icon name="sparkles" size={11} />
                        <span>{t("vault.edit.generate")}</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder={t("vault.edit.passwordPh")}
                      value={editingItem.password ?? ""}
                      onChange={(e) => setEditingItem({ ...editingItem, password: e.target.value })}
                      className="vault-text-input"
                    />
                  </div>

                  <div className="vault-form-row">
                    <label>{t("vault.edit.website")}</label>
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
                    <label>{t("vault.edit.cardNumber")}</label>
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
                      <label>{t("vault.edit.cardExpiry")}</label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        value={editingItem.cardExpiry ?? ""}
                        onChange={(e) => setEditingItem({ ...editingItem, cardExpiry: e.target.value })}
                        className="vault-text-input"
                      />
                    </div>
                    <div className="vault-form-row">
                      <label>{t("vault.edit.cardCvv")}</label>
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
                <label>{t("vault.edit.notes")}</label>
                <textarea
                  placeholder={t("vault.edit.notesPh")}
                  value={editingItem.notes ?? ""}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                  className="vault-textarea"
                  rows={3}
                />
              </div>

              {/* Modal Buttons */}
              <div className="vault-modal-footer">
                <button type="button" className="vault-btn" onClick={() => setEditModalOpen(false)}>
                  {t("vault.edit.cancel")}
                </button>
                <button type="submit" className="vault-btn vault-btn-primary">
                  <Icon name="check" size={14} />
                  <span>{t("vault.edit.save")}</span>
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
              <h3>{t("vault.gen.title")}</h3>
              <button className="vault-modal-close" onClick={() => setGeneratorOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="vault-modal-body">
              {/* Output & Copy Box */}
              <div className="vault-gen-result-box">
                <div className="vault-gen-string">{generatedPass}</div>
                <div className="vault-gen-actions">
                  <button className="vault-icon-btn" onClick={triggerGenerate} title={t("vault.gen.regenerate")}>
                    <Icon name="refresh" size={16} />
                  </button>
                  <button
                    className="vault-icon-btn primary"
                    onClick={() => copySecret(generatedPass, t("vault.label.generated"))}
                    title={t("vault.gen.copyNow")}
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
                  {t("vault.gen.modeRandom")}
                </button>
                <button
                  className={`vault-cat-choice${genMode === "passphrase" ? " active" : ""}`}
                  onClick={() => {
                    setGenMode("passphrase");
                    setGeneratedPass(generatePassphrase(4));
                  }}
                >
                  {t("vault.gen.modePassphrase")}
                </button>
              </div>

              {genMode === "random" ? (
                <>
                  {/* Length Slider */}
                  <div className="vault-slider-row">
                    <div className="vault-row-between">
                      <label>{t("vault.gen.length", { count: genOpts.length })}</label>
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
                      <span>{t("vault.gen.uppercase")}</span>
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
                      <span>{t("vault.gen.lowercase")}</span>
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
                      <span>{t("vault.gen.numbers")}</span>
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
                      <span>{t("vault.gen.symbols")}</span>
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
                      <span>{t("vault.gen.avoidAmbiguous")}</span>
                    </label>
                  </div>
                </>
              ) : (
                <div className="vault-passphrase-info">
                  <p>{t("vault.gen.passphraseInfo")}</p>
                  <button className="vault-btn" onClick={() => setGeneratedPass(generatePassphrase(4))}>
                    <Icon name="refresh" size={13} />
                    <span>{t("vault.gen.newPassphrase")}</span>
                  </button>
                </div>
              )}

              <div className="vault-modal-footer">
                <button
                  type="button"
                  className="vault-btn vault-btn-primary"
                  onClick={() => {
                    copySecret(generatedPass, t("vault.label.password"));
                    setGeneratorOpen(false);
                  }}
                >
                  <Icon name="copy" size={14} />
                  <span>{t("vault.gen.copyClose")}</span>
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
              <h3>{t("vault.audit.title")}</h3>
              <button className="vault-modal-close" onClick={() => setAuditModalOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="vault-modal-body">
              <div className="vault-audit-summary-grid">
                <div className="vault-audit-card strong">
                  <div className="audit-num">{auditReport.strongCount}</div>
                  <div className="audit-label">{t("vault.audit.strong")}</div>
                </div>
                <div className="vault-audit-card weak">
                  <div className="audit-num">{auditReport.weakCount}</div>
                  <div className="audit-label">{t("vault.audit.weak")}</div>
                </div>
                <div className="vault-audit-card reused">
                  <div className="audit-num">{auditReport.reusedCount}</div>
                  <div className="audit-label">{t("vault.audit.reused")}</div>
                </div>
              </div>

              {auditReport.weakCount === 0 && auditReport.reusedCount === 0 ? (
                <div className="vault-audit-perfect">
                  <Icon name="shieldCheck" size={40} />
                  <h4>{t("vault.audit.perfectTitle")}</h4>
                  <p>{t("vault.audit.perfectDesc")}</p>
                </div>
              ) : (
                <div className="vault-audit-alerts">
                  {auditReport.weakCount > 0 && (
                    <div className="vault-audit-alert weak">
                      <Icon name="alertTriangle" size={16} />
                      <span>
                        {t("vault.audit.weakPre")} <strong>{auditReport.weakCount}</strong> {t("vault.audit.weakPost")}
                      </span>
                    </div>
                  )}
                  {auditReport.reusedCount > 0 && (
                    <div className="vault-audit-alert reused">
                      <Icon name="alertTriangle" size={16} />
                      <span>
                        {t("vault.audit.reusePre")} <strong>{auditReport.reusedCount}</strong> {t("vault.audit.reusePost")}
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
                  {t("vault.audit.gotIt")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- */}
      {/* MODAL 4: CSV Import Modal                                   */}
      {/* ----------------------------------------------------------- */}
      {importModalOpen && (
        <div className="vault-modal-backdrop animate-in" onClick={() => !importing && setImportModalOpen(false)}>
          <div className="vault-modal-box import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vault-modal-header">
              <h3>{t("vault.import.title")}</h3>
              <button className="vault-modal-close" onClick={() => !importing && setImportModalOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="vault-modal-body">
              {/* Option A: Quick Direct Import */}
              <div className="vault-import-card direct-option">
                <div className="vault-import-head">
                  <div className="vault-type-badge"><Icon name="key" size={14} /></div>
                  <div className="vault-import-info">
                    <h4>{t("vault.import.foundTitle")}</h4>
                    <p>{t("vault.import.foundDesc")}</p>
                  </div>
                </div>
                <button
                  className="vault-btn vault-btn-primary"
                  onClick={handleDirectImportChrome}
                  disabled={importing}
                >
                  <Icon name="upload" size={13} />
                  <span>{importing ? t("vault.import.importing") : t("vault.import.importNow")}</span>
                </button>
              </div>

              <div className="vault-import-divider">
                <span>{t("vault.import.divider")}</span>
              </div>

              {/* Option B: Custom File Upload */}
              <div className="vault-import-card upload-option">
                <input
                  type="file"
                  accept=".csv"
                  id="csv-file-input"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                  disabled={importing}
                />
                <label htmlFor="csv-file-input" className="vault-file-dropzone">
                  <Icon name="upload" size={24} />
                  <span>{t("vault.import.dropzone")}</span>
                  <span className="sub-hint">{t("vault.import.supports")}</span>
                </label>
              </div>

              <div className="vault-modal-footer">
                <button
                  type="button"
                  className="vault-btn"
                  onClick={() => setImportModalOpen(false)}
                  disabled={importing}
                >
                  {t("vault.import.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
