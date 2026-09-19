import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "../icons";
import { typingApi } from "../api";
import { convertKeyboardLayout, looksLikeLayoutMismatch } from "../utils/keyboardLayout";
import { checkSpelling, predictWords, SpellCheckResult, SpellIssue } from "../utils/spellChecker";

interface SmartTypingSuiteProps {
  onNotify: (msg: string, err?: boolean) => void;
}

type SubTab = "layout" | "spellcheck" | "voice";
type IssueFilter = "all" | "hamza" | "ta_marbuta" | "tanwin" | "punctuation" | "typo";

export const SmartTypingSuite: React.FC<SmartTypingSuiteProps> = ({ onNotify }) => {
  const [activeTab, setActiveTab] = useState<SubTab>("layout");

  // ---------------- State: Layout Inverter ----------------
  const [inputText, setInputText] = useState("");
  const [convertedText, setConvertedText] = useState("");
  const [sourceLang, setSourceLang] = useState<"ar" | "en">("en");
  const [targetLang, setTargetLang] = useState<"ar" | "en">("ar");
  const [isAutoDetect, setIsAutoDetect] = useState(true);
  const [isFixingSelection, setIsFixingSelection] = useState(false);
  const [predictions, setPredictions] = useState<string[]>([]);

  // ---------------- State: Spell Checker ----------------
  const [spellInput, setSpellInput] = useState("");
  const [spellResult, setSpellResult] = useState<SpellCheckResult | null>(null);
  const [selectedIssueFilter, setSelectedIssueFilter] = useState<IssueFilter>("all");

  // ---------------- State: Voice & Audio Studio ----------------
  const [isListening, setIsListening] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceLang, setVoiceLang] = useState<"ar-SA" | "ar-EG" | "en-US">("ar-SA");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  // ---------------- Layout Inversion Logic ----------------
  useEffect(() => {
    if (!inputText) {
      setConvertedText("");
      setPredictions([]);
      return;
    }

    const { converted, sourceLang: sLang, targetLang: tLang } = convertKeyboardLayout(
      inputText,
      isAutoDetect ? undefined : targetLang
    );
    setConvertedText(converted);
    if (isAutoDetect) {
      setSourceLang(sLang);
      setTargetLang(tLang);
    }

    const preds = predictWords(inputText, 6);
    setPredictions(preds);
  }, [inputText, isAutoDetect, targetLang]);

  const handleApplyPrediction = (word: string) => {
    const tokens = inputText.trimEnd().split(/\s+/);
    if (tokens.length > 0 && !inputText.endsWith(" ")) {
      tokens[tokens.length - 1] = word;
      setInputText(tokens.join(" ") + " ");
    } else {
      setInputText((prev) => (prev ? prev.trimEnd() + " " + word + " " : word + " "));
    }
  };

  const handleSwapLangs = useCallback(() => {
    setIsAutoDetect(false);
    const newTarget = targetLang === "ar" ? "en" : "ar";
    setTargetLang(newTarget);
    setSourceLang(newTarget === "ar" ? "en" : "ar");
  }, [targetLang]);

  const handlePasteFromClipboard = useCallback(async (setter: (val: string) => void, actionName: string) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setter(text);
        onNotify(`تم لصق النص من الحافظة (${text.length} حرف)`);
      } else {
        onNotify("الحافظة فارغة أو لا تحتوي على نص", true);
      }
    } catch {
      onNotify("تعذر القراءة من الحافظة تلقائياً", true);
    }
  }, [onNotify]);

  const handlePasteAndInvert = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        onNotify("الحافظة فارغة", true);
        return;
      }
      setInputText(text);
      const { converted } = convertKeyboardLayout(text);
      setConvertedText(converted);
      await navigator.clipboard.writeText(converted);
      onNotify("تم اللصق وعكس اللغة ونسخ النتيجة تلقائياً!");
    } catch {
      onNotify("تعذر قراءة الحافظة", true);
    }
  }, [onNotify]);

  const handleCopy = useCallback(async (textToCopy: string, label = "تم النسخ") => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      onNotify(`${label} بنجاح!`);
    } catch {
      onNotify("فشل النسخ إلى الحافظة", true);
    }
  }, [onNotify]);

  const handleInjectIntoActiveApp = useCallback(async (textToInject: string) => {
    if (!textToInject) return;
    try {
      await typingApi.injectText(textToInject);
      onNotify("تم اللصق في التطبيق النشط بنجاح!");
    } catch (e) {
      onNotify(`تعذر اللصق في التطبيق: ${String(e)}`, true);
    }
  }, [onNotify]);

  const handleFixSelectedTextSystemWide = useCallback(async () => {
    setIsFixingSelection(true);
    try {
      const fixed = await typingApi.fixSelectedText();
      onNotify(`تم تصحيح النص المحدد: "${fixed.slice(0, 25)}${fixed.length > 25 ? "..." : ""}"`);
    } catch (e) {
      onNotify(String(e) || "تعذر تصحيح النص. حدد نصاً في أي برنامج ثم جرب ثانية.", true);
    } finally {
      setIsFixingSelection(false);
    }
  }, [onNotify]);

  // ---------------- Spell Checker Logic ----------------
  const handleCheckSpelling = useCallback((text: string) => {
    setSpellInput(text);
    if (!text.trim()) {
      setSpellResult(null);
      return;
    }
    const result = checkSpelling(text);
    setSpellResult(result);
  }, []);

  const handleApplySingleFix = (issue: SpellIssue, suggestion: string) => {
    if (!spellResult) return;
    const newText =
      spellInput.slice(0, issue.start) +
      suggestion +
      spellInput.slice(issue.end);
    handleCheckSpelling(newText);
    onNotify(`تم تصحيح "${issue.word}" ➔ "${suggestion}"`);
  };

  const handleFixAllSpelling = useCallback(() => {
    if (!spellResult || spellResult.issues.length === 0) return;
    const fixed = spellResult.corrected;
    handleCheckSpelling(fixed);
    onNotify(`تم تصحيح كافة الأخطاء (${spellResult.issues.length} خطأ)!`);
  }, [spellResult, handleCheckSpelling, onNotify]);

  // Text-To-Speech function
  const handleSpeakText = useCallback((textToSpeak: string, lang = "ar-SA") => {
    if (!("speechSynthesis" in window)) {
      onNotify("النطق الصوتي غير مدعوم في متصفحك الحالي", true);
      return;
    }
    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }
    if (!textToSpeak.trim()) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = lang;
    utterance.rate = 0.95;

    utterance.onstart = () => setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    window.speechSynthesis.speak(utterance);
  }, [isPlayingAudio, onNotify]);

  // ---------------- Voice Typing Logic ----------------
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognizer = new SpeechRecognition();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = voiceLang;

    recognizer.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (final) {
        setVoiceTranscript((prev) => (prev ? prev + " " + final : final));
      }
      setInterimTranscript(interim);
    };

    recognizer.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        onNotify(`تنبيه الإملاء الصوتي: ${event.error}`, true);
      }
      setIsListening(false);
      clearInterval(timerIntervalRef.current);
    };

    recognizer.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
      clearInterval(timerIntervalRef.current);
    };

    recognitionRef.current = recognizer;

    return () => {
      try { recognizer.abort(); } catch { /* silent */ }
      clearInterval(timerIntervalRef.current);
    };
  }, [voiceLang, onNotify]);

  const toggleVoiceListening = useCallback(() => {
    if (!recognitionRef.current) {
      onNotify("الإملاء الصوتي غير مدعوم في بيئة التشغيل الحالية", true);
      return;
    }

    if (isListening) {
      try { recognitionRef.current.stop(); } catch { /* silent */ }
      setIsListening(false);
      clearInterval(timerIntervalRef.current);
    } else {
      try {
        recognitionRef.current.lang = voiceLang;
        recognitionRef.current.start();
        setIsListening(true);
        setRecordingSeconds(0);
        timerIntervalRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
        onNotify("جارٍ الاستماع... تحدث بوضوح عبر الميكروفون.");
      } catch (err) {
        onNotify("تعذر تشغيل الميكروفون. يرجى التحقق من أذونات الصوت.", true);
        setIsListening(false);
        clearInterval(timerIntervalRef.current);
      }
    }
  }, [isListening, voiceLang, onNotify]);

  // Format seconds to mm:ss
  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Filtered issues list
  const filteredIssues = spellResult
    ? spellResult.issues.filter((issue) => {
        if (selectedIssueFilter === "all") return true;
        if (selectedIssueFilter === "hamza") return issue.type === "hamza";
        if (selectedIssueFilter === "ta_marbuta") return issue.type === "ta_marbuta";
        if (selectedIssueFilter === "tanwin") return issue.type === "tanwin";
        if (selectedIssueFilter === "punctuation") return issue.type === "punctuation" || issue.type === "waw_spacing";
        if (selectedIssueFilter === "typo") return issue.type === "typo";
        return true;
      })
    : [];

  // Keyboard Shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") { e.preventDefault(); setActiveTab("layout"); return; }
      if (e.altKey && e.key === "2") { e.preventDefault(); setActiveTab("spellcheck"); return; }
      if (e.altKey && e.key === "3") { e.preventDefault(); setActiveTab("voice"); return; }

      if (e.altKey && (e.key.toLowerCase() === "s")) {
        e.preventDefault();
        handleSwapLangs();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleFixSelectedTextSystemWide();
        return;
      }

      if (activeTab === "layout") {
        if (e.shiftKey && e.key === "Enter") {
          e.preventDefault();
          if (convertedText) handleInjectIntoActiveApp(convertedText);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          if (convertedText) handleCopy(convertedText, "تم نسخ النتيجة المعكوسة");
          return;
        }
      }

      if (activeTab === "spellcheck") {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          handleFixAllSpelling();
          return;
        }
        if (e.shiftKey && e.key === "Enter") {
          e.preventDefault();
          if (spellInput) handleInjectIntoActiveApp(spellInput);
          return;
        }
      }

      if (activeTab === "voice") {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
          e.preventDefault();
          toggleVoiceListening();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTab,
    convertedText,
    handleCopy,
    handleFixAllSpelling,
    handleFixSelectedTextSystemWide,
    handleInjectIntoActiveApp,
    handleSwapLangs,
    spellInput,
    toggleVoiceListening,
  ]);

  const sampleInvertTexts = [
    { label: "hghsjo]hl ➔ الاستخدام", val: "hghsjo]hl" },
    { label: "صصصزلخخلمثزؤخة ➔ www.google.com", val: "صصصزلخخلمثزؤخة" },
    { label: "ClipVault ➔ زمهحثفعمف", val: "ClipVault" },
    { label: "lvpfh f;l ➔ مرحبا بكم", val: "lvpfh f;l" },
  ];

  return (
    <div className="mobile-typing-suite animate-fade-in">
      {/* 1. Header Bar */}
      <header className="mobile-typing-topbar">
        <div className="typing-header-brand">
          <div className="typing-sparkle-ico">
            <Icon name="sparkles" size={14} />
          </div>
          <div className="typing-header-titles">
            <span className="typing-main-heading">الكتابة والتدقيق الذكي</span>
            <span className="typing-sub-heading">حلول الكتابة الفورية لنظام Windows</span>
          </div>
        </div>

        <button
          className={`btn-quick-fix-selection ${isFixingSelection ? "loading" : ""}`}
          onClick={handleFixSelectedTextSystemWide}
          disabled={isFixingSelection}
          title="تصحيح النص المحدد في أي تطبيق واستبداله فوراً (Ctrl+Shift+X)"
        >
          <Icon name="sparkles" size={12} />
          <span>تصحيح التحديد</span>
          <kbd className="inline-kbd">Ctrl+Shift+X</kbd>
        </button>
      </header>

      {/* 2. Sub-Tab Segment Navigation */}
      <nav className="mobile-segment-tabs" role="tablist" aria-label="أقسام الكتابة الذكية">
        <button
          className={`segment-btn ${activeTab === "layout" ? "active" : ""}`}
          onClick={() => setActiveTab("layout")}
          title="عكس لغة لوحة المفاتيح (Alt+1)"
        >
          <Icon name="globe" size={13} />
          <span>عكس اللغة</span>
        </button>

        <button
          className={`segment-btn ${activeTab === "spellcheck" ? "active" : ""}`}
          onClick={() => setActiveTab("spellcheck")}
          title="التدقيق اللغوي والإملائي (Alt+2)"
        >
          <Icon name="check" size={13} />
          <span>المدقق الإملائي</span>
          {spellResult && spellResult.issues.length > 0 && (
            <span className="tab-pill-counter warn">{spellResult.issues.length}</span>
          )}
        </button>

        <button
          className={`segment-btn ${activeTab === "voice" ? "active" : ""}`}
          onClick={() => setActiveTab("voice")}
          title="استوديو الإملاء الصوتي (Alt+3)"
        >
          <Icon name="microphone" size={13} />
          <span>الإملاء الصوتي</span>
          {isListening && <span className="tab-pill-counter live">نشط {formatTimer(recordingSeconds)}</span>}
        </button>
      </nav>

      {/* 3. TAB 1: KEYBOARD LAYOUT INVERTER */}
      {activeTab === "layout" && (
        <section className="mobile-tab-scroll-body">
          {/* Prediction Bar */}
          {predictions.length > 0 && (
            <div className="mobile-predictions-strip">
              <span className="predictions-tag">
                <Icon name="sparkles" size={11} /> اقتراحات:
              </span>
              <div className="predictions-scroll-row">
                {predictions.map((word, idx) => (
                  <button
                    key={idx}
                    className="mobile-word-chip"
                    onClick={() => handleApplyPrediction(word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Box Card */}
          <div className="mobile-card-panel input-panel">
            <div className="panel-bar-top">
              <div className="lang-indicator-pill">
                <span className={`status-indicator ${sourceLang}`} />
                <span>المُدخل: {sourceLang === "ar" ? "عربي" : "English"}</span>
                {looksLikeLayoutMismatch(inputText) && (
                  <span className="mismatch-warning-tag">
                    <Icon name="alert-triangle" size={11} /> لغة معكوسة!
                  </span>
                )}
              </div>
              <div className="panel-actions-row">
                <button
                  className="mini-action-pill"
                  onClick={() => handlePasteFromClipboard(setInputText, "حقل الإدخال")}
                  title="لصق من الحافظة"
                >
                  <Icon name="clipboard" size={11} />
                  <span>لصق</span>
                </button>
                {inputText && (
                  <button
                    className="mini-icon-btn"
                    onClick={() => setInputText("")}
                    title="مسح الحقل"
                  >
                    <Icon name="trash" size={12} />
                  </button>
                )}
              </div>
            </div>

            <textarea
              className="mobile-smart-textarea"
              placeholder="اكتب هنا بحروف مقلوبة مثل: 'hghsjo]hl' أو 'صصصزلخخلمثزؤخة'..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              dir="auto"
              autoFocus
            />

            <div className="panel-bar-bottom">
              <span className="count-label">{inputText.length} حرف</span>
              <div className="samples-wrap">
                <span className="samples-lbl">نماذج:</span>
                {sampleInvertTexts.slice(0, 3).map((sample, idx) => (
                  <button
                    key={idx}
                    className="mini-sample-chip"
                    onClick={() => setInputText(sample.val)}
                    title={sample.label}
                  >
                    {sample.val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Paste & Invert Button Strip */}
          <div className="quick-paste-strip">
            <button
              className="btn-quick-paste-invert"
              onClick={handlePasteAndInvert}
              title="قراءة الحافظة وعكس لغتها وحفظ النتيجة فوراً بضغطة واحدة"
            >
              <Icon name="refresh" size={13} />
              <span>⚡ لصق وعكس فوري من الحافظة</span>
            </button>
          </div>

          {/* Action Divider Strip */}
          <div className="mobile-action-strip">
            <button
              className="btn-round-swap"
              onClick={handleSwapLangs}
              title="تبديل اتجاه التحويل يدويًا (Alt+S)"
            >
              <Icon name="refresh" size={14} />
            </button>
            <span className="swap-label">
              {sourceLang === "ar" ? "عربي ➔ إنجليزي" : "English ➔ عربي"}
            </span>
          </div>

          {/* Output Box Card */}
          <div className="mobile-card-panel output-panel">
            <div className="panel-bar-top">
              <div className="lang-indicator-pill">
                <span className={`status-indicator ${targetLang}`} />
                <span>النتيجة المعكوسة: {targetLang === "ar" ? "عربي" : "English"}</span>
              </div>
              <div className="panel-actions-row">
                {convertedText && (
                  <>
                    <button
                      className="pill-action-btn primary"
                      onClick={() => handleCopy(convertedText, "تم نسخ النتيجة")}
                      title="نسخ النتيجة (Ctrl+Enter)"
                    >
                      <Icon name="copy" size={12} />
                      <span>نسخ</span>
                    </button>
                    <button
                      className="pill-action-btn accent"
                      onClick={() => handleInjectIntoActiveApp(convertedText)}
                      title="لصق في التطبيق النشط فوراً (Shift+Enter)"
                    >
                      <Icon name="monitor" size={12} />
                      <span>لصق بالتطبيق</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <textarea
              className="mobile-smart-textarea output"
              placeholder="النتيجة المعكوسة ستظهر هنا لحظياً..."
              value={convertedText}
              readOnly
              dir="auto"
            />

            {convertedText && (
              <div className="panel-bar-bottom single-action">
                <button
                  className="btn-transfer-link"
                  onClick={() => {
                    setSpellInput(convertedText);
                    handleCheckSpelling(convertedText);
                    setActiveTab("spellcheck");
                  }}
                >
                  <Icon name="check" size={12} />
                  <span>تدقيق هذه النتيجة إملائياً في المدقق ➔</span>
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. TAB 2: PRO SPELL CHECKER */}
      {activeTab === "spellcheck" && (
        <section className="mobile-tab-scroll-body">
          {/* Editor Card */}
          <div className="mobile-card-panel spell-panel">
            <div className="panel-bar-top">
              <div className="panel-title-group">
                <Icon name="edit" size={13} />
                <span>محرر التدقيق اللغوي</span>
              </div>
              <div className="panel-actions-row">
                <button
                  className="mini-action-pill"
                  onClick={() => handlePasteFromClipboard(handleCheckSpelling, "محرر التدقيق")}
                  title="لصق نص من الحافظة وتدقيقه"
                >
                  <Icon name="clipboard" size={11} />
                  <span>لصق وتدقيق</span>
                </button>
                {spellResult && spellResult.issues.length > 0 && (
                  <button
                    className="pill-action-btn magic pulse-btn"
                    onClick={handleFixAllSpelling}
                    title="تصحيح كافة الأخطاء المكتشفة بنقرة واحدة (Ctrl+Enter)"
                  >
                    <Icon name="sparkles" size={12} />
                    <span>تصحيح الكل ({spellResult.issues.length})</span>
                  </button>
                )}
                {spellInput && (
                  <button
                    className="mini-icon-btn"
                    onClick={() => handleCheckSpelling("")}
                    title="مسح الحقل"
                  >
                    <Icon name="trash" size={12} />
                  </button>
                )}
              </div>
            </div>

            <textarea
              className="mobile-smart-textarea spell-text"
              placeholder="الصق أو اكتب النص لتدقيقه... مثلاً: 'شكرن جزيلن تم إستدعاء احمد حتي نصل الي حل جدن ممتز'"
              value={spellInput}
              onChange={(e) => handleCheckSpelling(e.target.value)}
              dir="auto"
            />

            <div className="panel-bar-bottom">
              <div className="spell-counts">
                <span>الكلمات: <b>{spellResult?.wordCount || 0}</b></span>
                <span>الملاحظات: <b className={spellResult && spellResult.issues.length > 0 ? "warn-text" : ""}>{spellResult?.issues.length || 0}</b></span>
              </div>
              {spellInput && (
                <div className="panel-actions-row">
                  <button
                    className="pill-action-btn"
                    onClick={() => handleSpeakText(spellInput)}
                    title="الاستماع إلى نطق النص"
                  >
                    <Icon name={isPlayingAudio ? "pause" : "volume-2"} size={11} />
                    <span>{isPlayingAudio ? "إيقاف" : "نطق"}</span>
                  </button>
                  <button
                    className="pill-action-btn"
                    onClick={() => handleCopy(spellInput, "تم نسخ النص المصحح")}
                  >
                    <Icon name="copy" size={11} />
                    <span>نسخ</span>
                  </button>
                  <button
                    className="pill-action-btn accent"
                    onClick={() => handleInjectIntoActiveApp(spellInput)}
                  >
                    <Icon name="monitor" size={11} />
                    <span>لصق بالتطبيق</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Results and Issues Card with Interactive Filter Badges */}
          <div className="mobile-card-panel issues-panel">
            <div className="panel-bar-top">
              <div className="panel-title-group">
                <Icon name="info" size={13} />
                <span>تقرير السلامة اللغوية</span>
              </div>
              {spellResult && (
                <div
                  className="score-badge-compact"
                  style={{
                    color:
                      spellResult.score > 80
                        ? "var(--success)"
                        : spellResult.score > 50
                        ? "var(--warn)"
                        : "var(--danger)",
                  }}
                >
                  سلامة النص: {spellResult.score}%
                </div>
              )}
            </div>

            {/* Category Filter Chips */}
            {spellResult && spellResult.issues.length > 0 && (
              <div className="issue-filter-chips">
                <button
                  className={`filter-chip ${selectedIssueFilter === "all" ? "active" : ""}`}
                  onClick={() => setSelectedIssueFilter("all")}
                >
                  الكل ({spellResult.issues.length})
                </button>
                {spellResult.categoriesCount.hamza > 0 && (
                  <button
                    className={`filter-chip ${selectedIssueFilter === "hamza" ? "active" : ""}`}
                    onClick={() => setSelectedIssueFilter("hamza")}
                  >
                    الهمزات ({spellResult.categoriesCount.hamza})
                  </button>
                )}
                {spellResult.categoriesCount.ta_marbuta > 0 && (
                  <button
                    className={`filter-chip ${selectedIssueFilter === "ta_marbuta" ? "active" : ""}`}
                    onClick={() => setSelectedIssueFilter("ta_marbuta")}
                  >
                    التاء المربوطة ({spellResult.categoriesCount.ta_marbuta})
                  </button>
                )}
                {spellResult.categoriesCount.tanwin > 0 && (
                  <button
                    className={`filter-chip ${selectedIssueFilter === "tanwin" ? "active" : ""}`}
                    onClick={() => setSelectedIssueFilter("tanwin")}
                  >
                    التنوين ({spellResult.categoriesCount.tanwin})
                  </button>
                )}
                {spellResult.categoriesCount.punctuation > 0 && (
                  <button
                    className={`filter-chip ${selectedIssueFilter === "punctuation" ? "active" : ""}`}
                    onClick={() => setSelectedIssueFilter("punctuation")}
                  >
                    الترقيم ({spellResult.categoriesCount.punctuation})
                  </button>
                )}
                {spellResult.categoriesCount.typo > 0 && (
                  <button
                    className={`filter-chip ${selectedIssueFilter === "typo" ? "active" : ""}`}
                    onClick={() => setSelectedIssueFilter("typo")}
                  >
                    أخطاء شائعة ({spellResult.categoriesCount.typo})
                  </button>
                )}
              </div>
            )}

            {spellResult ? (
              <div className="mobile-issues-list">
                {spellResult.issues.length === 0 ? (
                  <div className="compact-clean-msg">
                    <Icon name="check-circle" size={24} />
                    <span>النص سليم وخالٍ تماماً من الأخطاء الإملائية المكتشفة!</span>
                  </div>
                ) : filteredIssues.length === 0 ? (
                  <div className="compact-empty-msg">
                    <span>لا توجد أخطاء في هذا التصنيف المحدد.</span>
                  </div>
                ) : (
                  filteredIssues.map((issue) => (
                    <div key={issue.id} className="mobile-issue-row">
                      <div className="issue-details">
                        <span className="bad-word">{issue.word}</span>
                        <span className="issue-arrow">➔</span>
                        <div className="suggestions-btns">
                          {issue.suggestions.map((sug, sIdx) => (
                            <button
                              key={sIdx}
                              className="btn-apply-suggestion"
                              onClick={() => handleApplySingleFix(issue, sug)}
                              title="انقر لتطبيق هذا التصحيح في النص"
                            >
                              <span>{sug}</span>
                              <Icon name="check" size={10} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <span className="issue-explanation">{issue.explanation}</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="compact-empty-msg">
                <span>اكتب أو الصق نصاً في المحرر أعلاه لبدء الفحص التلقائي الفوري.</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5. TAB 3: VOICE-TO-TEXT STUDIO */}
      {activeTab === "voice" && (
        <section className="mobile-tab-scroll-body">
          <div className="mobile-card-panel voice-card">
            {/* Top Config */}
            <div className="panel-bar-top">
              <div className="panel-title-group">
                <Icon name="microphone" size={13} />
                <span>استوديو الإملاء الصوتي</span>
              </div>
              <div className="voice-lang-picker">
                <select
                  className="mobile-voice-select"
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value as any)}
                  disabled={isListening}
                >
                  <option value="ar-SA">العربية (السعودية / فصحى)</option>
                  <option value="ar-EG">العربية (مصر)</option>
                  <option value="en-US">English (US)</option>
                </select>
              </div>
            </div>

            {/* Centered Floating Mic Button with Pulsing Waves */}
            <div className="mobile-mic-center">
              <div className={`mic-ring-halo ${isListening ? "pulsing" : ""}`}>
                <button
                  className={`mobile-big-mic ${isListening ? "active-listening" : ""}`}
                  onClick={toggleVoiceListening}
                  title={isListening ? "إيقاف الاستماع (Ctrl+M)" : "بدء التسجيل الصوتي (Ctrl+M)"}
                >
                  <Icon name={isListening ? "pause" : "microphone"} size={26} />
                </button>
              </div>
              <div className="mic-status-container">
                <span className="mic-hint-label">
                  {isListening
                    ? `جارٍ الاستماع... (${formatTimer(recordingSeconds)})`
                    : "انقر على الميكروفون لبدء الإملاء (Ctrl+M)"}
                </span>
                {isListening && (
                  <div className="audio-bars-sim">
                    <span className="bar b1" />
                    <span className="bar b2" />
                    <span className="bar b3" />
                    <span className="bar b4" />
                    <span className="bar b5" />
                  </div>
                )}
              </div>
            </div>

            {/* Transcript Area */}
            <div className="mobile-transcript-box" dir="auto">
              {voiceTranscript ? (
                <>
                  <span className="final-transcript">{voiceTranscript}</span>
                  {interimTranscript && (
                    <span className="interim-transcript"> {interimTranscript}</span>
                  )}
                </>
              ) : interimTranscript ? (
                <span className="interim-transcript">{interimTranscript}</span>
              ) : (
                <span className="transcript-placeholder">
                  تحدث عبر الميكروفون وسيتم تفريغ كلامك هنا بدقة متناهية...
                </span>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="panel-bar-bottom">
              {voiceTranscript ? (
                <>
                  <button
                    className="mini-icon-btn"
                    onClick={() => setVoiceTranscript("")}
                    title="مسح الحقل"
                  >
                    <Icon name="trash" size={12} />
                  </button>
                  <div className="panel-actions-row">
                    <button
                      className="pill-action-btn"
                      onClick={() => handleSpeakText(voiceTranscript, voiceLang)}
                      title="الاستماع إلى نطق النص"
                    >
                      <Icon name={isPlayingAudio ? "pause" : "volume-2"} size={11} />
                      <span>{isPlayingAudio ? "إيقاف" : "نطق"}</span>
                    </button>
                    <button
                      className="pill-action-btn primary"
                      onClick={() => handleCopy(voiceTranscript, "تم نسخ النص المفرغ")}
                    >
                      <Icon name="copy" size={11} />
                      <span>نسخ</span>
                    </button>
                    <button
                      className="pill-action-btn accent"
                      onClick={() => handleInjectIntoActiveApp(voiceTranscript)}
                    >
                      <Icon name="monitor" size={11} />
                      <span>لصق بالتطبيق</span>
                    </button>
                    <button
                      className="pill-action-btn"
                      onClick={() => {
                        setSpellInput(voiceTranscript);
                        handleCheckSpelling(voiceTranscript);
                        setActiveTab("spellcheck");
                      }}
                      title="تدقيق النص المفرغ إملائياً"
                    >
                      <Icon name="check" size={11} />
                      <span>تدقيق</span>
                    </button>
                  </div>
                </>
              ) : (
                <span className="empty-hint">اضغط الميكروفون أو اختصار Ctrl+M للتحدث</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 6. Mobile Shortcuts Quick Footer */}
      <footer className="mobile-shortcuts-footer">
        <div className="shortcut-chip-item">
          <kbd>Ctrl+Shift+X</kbd> <span>تصحيح التحديد</span>
        </div>
        <div className="shortcut-chip-item">
          <kbd>Ctrl+↵</kbd> <span>نسخ / تصحيح الكل</span>
        </div>
        <div className="shortcut-chip-item">
          <kbd>Shift+↵</kbd> <span>لصق بالتطبيق</span>
        </div>
      </footer>
    </div>
  );
};
