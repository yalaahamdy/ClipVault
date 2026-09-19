import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "../icons";
import { typingApi } from "../api";
import { convertKeyboardLayout, looksLikeLayoutMismatch } from "../utils/keyboardLayout";
import { checkSpelling, predictWords, SpellCheckResult, SpellIssue } from "../utils/spellChecker";

interface SmartTypingSuiteProps {
  onNotify: (msg: string, err?: boolean) => void;
}

type SubTab = "layout" | "spellcheck" | "voice";

export const SmartTypingSuite: React.FC<SmartTypingSuiteProps> = ({ onNotify }) => {
  const [activeTab, setActiveTab] = useState<SubTab>("layout");

  // ---------------- State: Layout Inverter ----------------
  const [inputText, setInputText] = useState("");
  const [convertedText, setConvertedText] = useState("");
  const [sourceLang, setSourceLang] = useState<"ar" | "en">("en");
  const [targetLang, setTargetLang] = useState<"ar" | "en">("ar");
  const [isAutoDetect, setIsAutoDetect] = useState(true);
  const [isFixingSelection, setIsFixingSelection] = useState(false);

  // Predictions for layout/spellcheck
  const [predictions, setPredictions] = useState<string[]>([]);

  // ---------------- State: Spell Checker ----------------
  const [spellInput, setSpellInput] = useState("");
  const [spellResult, setSpellResult] = useState<SpellCheckResult | null>(null);

  // ---------------- State: Voice Typing ----------------
  const [isListening, setIsListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"ar-SA" | "ar-EG" | "en-US">("ar-SA");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

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

    // Update predictions
    const preds = predictWords(inputText, 5);
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

  const handleSwapLangs = () => {
    setIsAutoDetect(false);
    const newTarget = targetLang === "ar" ? "en" : "ar";
    setTargetLang(newTarget);
    setSourceLang(newTarget === "ar" ? "en" : "ar");
  };

  const handleCopy = async (textToCopy: string, label = "تم النسخ") => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      onNotify(`${label} بنجاح!`);
    } catch {
      onNotify("فشل النسخ إلى الحافظة", true);
    }
  };

  const handleInjectIntoActiveApp = async (textToInject: string) => {
    if (!textToInject) return;
    try {
      await typingApi.injectText(textToInject);
      onNotify("تم لصق النص في التطبيق النشط بنجاح!");
    } catch (e) {
      onNotify(`تعذر اللصق في التطبيق: ${String(e)}`, true);
    }
  };

  const handleFixSelectedTextSystemWide = async () => {
    setIsFixingSelection(true);
    try {
      const fixed = await typingApi.fixSelectedText();
      onNotify(`تم تصحيح لغة النص المحدد في التطبيق النشط: "${fixed.slice(0, 30)}${fixed.length > 30 ? "..." : ""}"`);
    } catch (e) {
      onNotify(String(e) || "تعذر تصحيح النص المحدد. تأكد من تظليل النص في التطبيق أولاً.", true);
    } finally {
      setIsFixingSelection(false);
    }
  };

  // ---------------- Spell Checker Logic ----------------
  const handleCheckSpelling = (text: string) => {
    setSpellInput(text);
    if (!text.trim()) {
      setSpellResult(null);
      return;
    }
    const result = checkSpelling(text);
    setSpellResult(result);
  };

  const handleApplySingleFix = (issue: SpellIssue, suggestion: string) => {
    if (!spellResult) return;
    const newText =
      spellInput.slice(0, issue.start) +
      suggestion +
      spellInput.slice(issue.end);
    handleCheckSpelling(newText);
    onNotify(`تم استبدال "${issue.word}" بـ "${suggestion}"`);
  };

  const handleFixAllSpelling = () => {
    if (!spellResult || spellResult.issues.length === 0) return;
    const fixed = spellResult.corrected;
    handleCheckSpelling(fixed);
    onNotify(`تم تطبيق كافة التصحيحات (${spellResult.issues.length} خطأ)!`);
  };

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
      console.warn("Speech recognition error:", event.error);
      if (event.error !== "no-speech") {
        onNotify(`تنبيه الإملاء الصوتي: ${event.error}`, true);
      }
      setIsListening(false);
    };

    recognizer.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognizer;

    return () => {
      try {
        recognizer.abort();
      } catch { /* silent */ }
    };
  }, [voiceLang, onNotify]);

  const toggleVoiceListening = () => {
    if (!recognitionRef.current) {
      onNotify("خاصية التعرف على الصوت غير مدعومة في بيئة التشغيل الحالية", true);
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch { /* silent */ }
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.lang = voiceLang;
        recognitionRef.current.start();
        setIsListening(true);
        onNotify("جارٍ الاستماع... تحدث بوضوح عبر الميكروفون.");
      } catch (err) {
        onNotify("تعذر بدء الميكروفون. يرجى التحقق من أذونات الصوت.", true);
        setIsListening(false);
      }
    }
  };

  const sampleInvertTexts = [
    { label: "hghsjo]hl ➔ الاستخدام", val: "hghsjo]hl" },
    { label: "صصصزلخخلمثزؤخة ➔ www.google.com", val: "صصصزلخخلمثزؤخة" },
    { label: "ClipVault ➔ زمهحثفعمف", val: "ClipVault" },
    { label: "lvpfh f;l ➔ مرحبا بكم", val: "lvpfh f;l" },
  ];

  return (
    <div className="typing-suite-view animate-fade-in">
      {/* Header Banner */}
      <div className="typing-hero-card">
        <div className="typing-hero-content">
          <div className="typing-hero-badge">
            <Icon name="zap" size={14} />
            <span>Smart Writing & Typing Suite</span>
          </div>
          <h2 className="typing-hero-title">جناح الكتابة الذكي والتدقيق الشامل</h2>
          <p className="typing-hero-desc">
            حلول فورية لمشاكل الكتابة الشائعة: تصحيح اللغة المقلوبة، تدقيق الهمزات والأخطاء اللغوية، والكتابة الصوتية الفائقة لنظام ويندوز.
          </p>
        </div>

        <div className="typing-hero-action">
          <button
            className={`btn-hero-fix-selection ${isFixingSelection ? "loading" : ""}`}
            onClick={handleFixSelectedTextSystemWide}
            disabled={isFixingSelection}
            title="حدد أي نص في أي برنامج واضغط هنا لتصحيح لغته فوراً واستبداله في مكانه"
          >
            <Icon name="sparkles" size={16} />
            <span>تصحيح النص المحدد في أي تطبيق نشط</span>
          </button>
          <span className="hero-hint">يعمل على مستوى نظام Windows فوراً</span>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="typing-subtabs-bar">
        <button
          className={`typing-subtab ${activeTab === "layout" ? "active" : ""}`}
          onClick={() => setActiveTab("layout")}
        >
          <Icon name="globe" size={14} />
          <span>عكس لغة لوحة المفاتيح</span>
        </button>

        <button
          className={`typing-subtab ${activeTab === "spellcheck" ? "active" : ""}`}
          onClick={() => setActiveTab("spellcheck")}
        >
          <Icon name="check" size={14} />
          <span>المدقق الإملائي واللغوي</span>
          {spellResult && spellResult.issues.length > 0 && (
            <span className="subtab-badge warn">{spellResult.issues.length}</span>
          )}
        </button>

        <button
          className={`typing-subtab ${activeTab === "voice" ? "active" : ""}`}
          onClick={() => setActiveTab("voice")}
        >
          <Icon name="microphone" size={14} />
          <span>الكتابة والإملاء الصوتي</span>
          {isListening && <span className="subtab-badge live">تسجيل...</span>}
        </button>
      </div>

      {/* TAB 1: KEYBOARD LAYOUT INVERTER */}
      {activeTab === "layout" && (
        <div className="typing-tab-content">
          {/* Quick Word Prediction Bar */}
          {predictions.length > 0 && (
            <div className="prediction-bar">
              <span className="prediction-label">
                <Icon name="sparkles" size={12} /> توقع الكلمات:
              </span>
              <div className="prediction-chips">
                {predictions.map((word, idx) => (
                  <button
                    key={idx}
                    className="prediction-chip"
                    onClick={() => handleApplyPrediction(word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="layout-converter-grid">
            {/* Input Box */}
            <div className="converter-panel-card source-card">
              <div className="converter-panel-header">
                <div className="panel-lang-badge">
                  <span className="dot dot-source" />
                  <span>النص المدخل ({sourceLang === "ar" ? "عربي" : "إنجليزي"})</span>
                  {looksLikeLayoutMismatch(inputText) && (
                    <span className="mismatch-detected-pill">
                      <Icon name="alert-triangle" size={12} /> خطأ تبديل لغة مكتشف!
                    </span>
                  )}
                </div>
                <div className="panel-actions">
                  {inputText && (
                    <button
                      className="panel-mini-btn"
                      onClick={() => setInputText("")}
                      title="مسح"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </div>
              </div>

              <textarea
                className="converter-textarea"
                placeholder="اكتب هنا، مثلاً: اكتب بحروف إنجليزية وأنت تقصد العربية مثل 'hghsjoqhl' أو العكس..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                dir="auto"
                autoFocus
              />

              <div className="converter-panel-footer">
                <span className="text-count-info">{inputText.length} حرف</span>
                <div className="quick-samples">
                  <span className="samples-title">نماذج سريعة:</span>
                  {sampleInvertTexts.map((sample, idx) => (
                    <button
                      key={idx}
                      className="sample-pill-btn"
                      onClick={() => setInputText(sample.val)}
                      title={`تجربة: ${sample.label}`}
                    >
                      {sample.val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Middle Controls (Swap & Convert) */}
            <div className="converter-divider-control">
              <button
                className="btn-swap-langs"
                onClick={handleSwapLangs}
                title="تبديل اتجاه التحويل يدويًا"
              >
                <Icon name="refresh" size={16} />
              </button>
              <div className="divider-line" />
            </div>

            {/* Output Box */}
            <div className="converter-panel-card target-card">
              <div className="converter-panel-header">
                <div className="panel-lang-badge">
                  <span className="dot dot-target" />
                  <span>النتيجة المعكوسة ({targetLang === "ar" ? "عربي" : "إنجليزي"})</span>
                </div>
                <div className="panel-actions">
                  {convertedText && (
                    <>
                      <button
                        className="panel-action-pill primary"
                        onClick={() => handleCopy(convertedText)}
                        title="نسخ النتيجة إلى الحافظة"
                      >
                        <Icon name="copy" size={13} />
                        <span>نسخ</span>
                      </button>
                      <button
                        className="panel-action-pill accent"
                        onClick={() => handleInjectIntoActiveApp(convertedText)}
                        title="لصق النص المعكوس فوراً في التطبيق أو المستند النشط"
                      >
                        <Icon name="monitor" size={13} />
                        <span>لصق بالتطبيق النشط</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <textarea
                className="converter-textarea target"
                placeholder="ستظهر النتيجة المعكوسة هنا لحظياً..."
                value={convertedText}
                readOnly
                dir="auto"
              />

              <div className="converter-panel-footer">
                <span className="text-count-info">{convertedText.length} حرف</span>
                {convertedText && (
                  <button
                    className="send-to-spellcheck-btn"
                    onClick={() => {
                      setSpellInput(convertedText);
                      handleCheckSpelling(convertedText);
                      setActiveTab("spellcheck");
                    }}
                  >
                    <Icon name="check" size={12} />
                    <span>فحص وتدقيق هذه النتيجة في المدقق الإملائي ➔</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRO SPELL CHECKER */}
      {activeTab === "spellcheck" && (
        <div className="typing-tab-content">
          <div className="spellcheck-grid">
            {/* Left: Input Textarea */}
            <div className="spell-editor-box">
              <div className="spell-editor-header">
                <div className="spell-header-title">
                  <Icon name="edit" size={14} />
                  <span>محرر التدقيق والتحليل اللغوي</span>
                </div>
                <div className="spell-header-actions">
                  {spellResult && spellResult.issues.length > 0 && (
                    <button
                      className="btn-fix-all-magic"
                      onClick={handleFixAllSpelling}
                      title="تصحيح كافة الأخطاء المكتشفة بنقرة واحدة"
                    >
                      <Icon name="sparkles" size={14} />
                      <span>تصحيح الكل تلقائياً ({spellResult.issues.length})</span>
                    </button>
                  )}
                  {spellInput && (
                    <button
                      className="panel-mini-btn"
                      onClick={() => handleCheckSpelling("")}
                      title="مسح"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </div>
              </div>

              <textarea
                className="spell-textarea"
                placeholder="الصق أو اكتب النص هنا لتدقيقه... مثلاً: 'شكرن جزيلن تم إستدعاء احمد حتي نصل الي حل جدن ممتز'"
                value={spellInput}
                onChange={(e) => handleCheckSpelling(e.target.value)}
                dir="auto"
              />

              <div className="spell-editor-footer">
                <div className="spell-stats-row">
                  <span>الكلمات: {spellResult?.wordCount || 0}</span>
                  <span>الأخطاء: {spellResult?.issues.length || 0}</span>
                </div>

                <div className="spell-footer-btns">
                  {spellInput && (
                    <>
                      <button
                        className="panel-action-pill"
                        onClick={() => handleCopy(spellInput, "تم نسخ النص المصحح")}
                      >
                        <Icon name="copy" size={12} />
                        <span>نسخ</span>
                      </button>
                      <button
                        className="panel-action-pill accent"
                        onClick={() => handleInjectIntoActiveApp(spellInput)}
                      >
                        <Icon name="monitor" size={12} />
                        <span>لصق في التطبيق النشط</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Analysis & Issues List */}
            <div className="spell-insights-box">
              <div className="insights-header">
                <Icon name="info" size={14} />
                <span>تقرير السلامة اللغوية والبدائل</span>
              </div>

              {spellResult ? (
                <div className="insights-body">
                  {/* Score Indicator */}
                  <div className="score-widget">
                    <div className="score-circle">
                      <span className="score-number">{spellResult.score}%</span>
                      <span className="score-caption">دقة النص</span>
                    </div>
                    <div className="score-details">
                      <div className="score-bar-bg">
                        <div
                          className="score-bar-fill"
                          style={{
                            width: `${spellResult.score}%`,
                            background:
                              spellResult.score > 80
                                ? "var(--success)"
                                : spellResult.score > 50
                                ? "var(--warn)"
                                : "var(--danger)",
                          }}
                        />
                      </div>
                      <span className="score-hint">
                        {spellResult.issues.length === 0
                          ? "نص سليم وخالٍ من الأخطاء المكتشفة!"
                          : `تم العثور على ${spellResult.issues.length} ملاحظة وتصحيح مقترح`}
                      </span>
                    </div>
                  </div>

                  {/* Issues List */}
                  <div className="issues-list">
                    {spellResult.issues.length === 0 ? (
                      <div className="clean-text-state">
                        <Icon name="check-circle" size={32} />
                        <p>ممتاز! النص سليم ومطابق لقواعد الإملاء المعتمدة.</p>
                      </div>
                    ) : (
                      spellResult.issues.map((issue) => (
                        <div key={issue.id} className="issue-card animate-in">
                          <div className="issue-card-top">
                            <span className="issue-word-bad">{issue.word}</span>
                            <span className="issue-arrow">➔</span>
                            <div className="issue-suggestions-wrap">
                              {issue.suggestions.map((sug, sIdx) => (
                                <button
                                  key={sIdx}
                                  className="suggestion-apply-btn"
                                  onClick={() => handleApplySingleFix(issue, sug)}
                                  title="انقر لتطبيق هذا التصحيح في النص"
                                >
                                  {sug}
                                  <Icon name="check" size={11} />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="issue-card-bottom">
                            <span className="issue-tag">{issue.type}</span>
                            <span className="issue-reason">{issue.explanation}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="insights-empty-state">
                  <Icon name="edit" size={28} />
                  <p>اكتب أو الصق نصاً في المحرر لبدء الفحص والتدقيق اللحظي.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VOICE-TO-TEXT STUDIO */}
      {activeTab === "voice" && (
        <div className="typing-tab-content">
          <div className="voice-studio-card">
            <div className="voice-studio-header">
              <div className="voice-studio-info">
                <div className="voice-icon-box">
                  <Icon name="microphone" size={20} />
                </div>
                <div>
                  <h3 className="voice-studio-title">استوديو الإملاء الصوتي المباشر</h3>
                  <p className="voice-studio-sub">
                    تحدث بوضوح ليتم تحويل صوتك إلى نص عربي أو إنجليزي فائق الدقة
                  </p>
                </div>
              </div>

              <div className="voice-controls-bar">
                <div className="lang-picker-group">
                  <label>لغة الإملاء:</label>
                  <select
                    className="voice-lang-select"
                    value={voiceLang}
                    onChange={(e) => setVoiceLang(e.target.value as any)}
                    disabled={isListening}
                  >
                    <option value="ar-SA">العربية (السعودية / فصحى)</option>
                    <option value="ar-EG">العربية (مصر)</option>
                    <option value="en-US">English (US)</option>
                  </select>
                </div>

                <button
                  className={`btn-toggle-mic ${isListening ? "listening" : ""}`}
                  onClick={toggleVoiceListening}
                >
                  <Icon name={isListening ? "pause" : "microphone"} size={16} />
                  <span>{isListening ? "إيقاف الاستماع" : "بدء الإملاء الصوتي"}</span>
                </button>
              </div>
            </div>

            {/* Mic Waves Animation if listening */}
            {isListening && (
              <div className="audio-visualizer-bar">
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-text">الميكروفون نشط — جارٍ استلام الموجات الصوتية وتحويلها إلى كلمات...</span>
              </div>
            )}

            {/* Live Transcript Display */}
            <div className="voice-transcript-wrapper">
              <div className="voice-transcript-box" dir="auto">
                {voiceTranscript ? (
                  <>
                    <span className="final-text">{voiceTranscript}</span>
                    {interimTranscript && (
                      <span className="interim-text"> {interimTranscript}</span>
                    )}
                  </>
                ) : interimTranscript ? (
                  <span className="interim-text">{interimTranscript}</span>
                ) : (
                  <span className="voice-placeholder">
                    {isListening
                      ? "جارٍ الاستماع... ابدأ بالتحدث الآن ليظهر كلامك هنا فوراً..."
                      : "انقر على 'بدء الإملاء الصوتي' وتحدث ليتم تدوين كلامك تلقائياً."}
                  </span>
                )}
              </div>

              <div className="voice-transcript-actions">
                <div className="voice-actions-left">
                  {voiceTranscript && (
                    <button
                      className="panel-mini-btn"
                      onClick={() => setVoiceTranscript("")}
                      title="مسح النص المفرغ"
                    >
                      <Icon name="trash" size={13} />
                      <span>مسح</span>
                    </button>
                  )}
                </div>

                <div className="voice-actions-right">
                  {voiceTranscript && (
                    <>
                      <button
                        className="panel-action-pill primary"
                        onClick={() => handleCopy(voiceTranscript, "تم نسخ النص المفرغ")}
                      >
                        <Icon name="copy" size={13} />
                        <span>نسخ النص</span>
                      </button>
                      <button
                        className="panel-action-pill accent"
                        onClick={() => handleInjectIntoActiveApp(voiceTranscript)}
                        title="ضخ هذا النص في التطبيق أو المستند النشط الآن"
                      >
                        <Icon name="monitor" size={13} />
                        <span>لصق بالتطبيق النشط</span>
                      </button>
                      <button
                        className="panel-action-pill"
                        onClick={() => {
                          setInputText(voiceTranscript);
                          setActiveTab("layout");
                        }}
                        title="عكس لغة هذا النص"
                      >
                        <Icon name="refresh" size={13} />
                        <span>عكس اللغة</span>
                      </button>
                      <button
                        className="panel-action-pill"
                        onClick={() => {
                          setSpellInput(voiceTranscript);
                          handleCheckSpelling(voiceTranscript);
                          setActiveTab("spellcheck");
                        }}
                        title="تدقيق هذا النص إملائياً"
                      >
                        <Icon name="check" size={13} />
                        <span>تدقيق إملائي</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
