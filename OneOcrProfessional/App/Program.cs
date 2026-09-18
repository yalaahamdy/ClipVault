using System;
using System.IO;
using System.Text;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Collections.Generic;
using OneOcr.Core;

namespace OneOcr.App {
    class Program {
        private static OcrEngine ocrEngine;
        private static bool isServerRunning = false;
        private static HttpListener httpListener;

        [STAThread]
        static void Main(string[] args) {
            AppDomain.CurrentDomain.UnhandledException += (s, e) => {
                Exception ex = e.ExceptionObject as Exception;
                AsyncLogger.Error("استثناء غير معالج في AppDomain: " + (ex != null ? ex.ToString() : "كائن استثناء غير معروف"));
            };

            TaskScheduler.UnobservedTaskException += (s, e) => {
                AsyncLogger.Error("استثناء غير معالج في TaskScheduler: " + e.Exception.ToString());
            };

            try {
                Console.OutputEncoding = Encoding.UTF8;
            } catch {
                // Ignore if console is not available (e.g. running as winexe)
            }

            AsyncLogger.SetLogFile("oneocr_suite_log.txt");

            // Parse arguments
            bool isCliMode = false;
            bool isServerMode = false;
            string inputPath = "";
            string outputPath = "ocr_output.json";
            string serverPort = "5050";

            for (int i = 0; i < args.Length; i++) {
                if (args[i] == "--cli") {
                    isCliMode = true;
                } else if (args[i] == "--server") {
                    isServerMode = true;
                } else if (args[i] == "--input" && i + 1 < args.Length) {
                    inputPath = args[++i];
                } else if (args[i] == "--output" && i + 1 < args.Length) {
                    outputPath = args[++i];
                } else if (args[i] == "--port" && i + 1 < args.Length) {
                    serverPort = args[++i];
                }
            }

            if (isCliMode) {
                RunCli(inputPath, outputPath);
            } else if (isServerMode) {
                RunServer(serverPort);
            } else {
                RunGui();
            }
        }

        // ── CLI Mode ────────────────────────────────────────────────────────────────
        private static void RunCli(string inputPath, string outputPath) {
            AsyncLogger.Info("بدء تشغيل الأداة في وضع سطر الأوامر (CLI)...");
            if (string.IsNullOrEmpty(inputPath)) {
                AsyncLogger.Error("خطأ: يجب تحديد مسار الإدخال باستخدام --input");
                return;
            }

            ocrEngine = new OcrEngine();
            if (!ocrEngine.Initialize()) {
                AsyncLogger.Error("خطأ: فشل تهيئة محرك OCR.");
                return;
            }

            try {
                OcrResponseEnvelope envelope = new OcrResponseEnvelope();

                if (Directory.Exists(inputPath)) {
                    string[] extensions = { "*.jpg", "*.jpeg", "*.png", "*.bmp", "*.tiff" };
                    List<string> files = new List<string>();
                    foreach (var ext in extensions) {
                        files.AddRange(Directory.GetFiles(inputPath, ext));
                    }

                    AsyncLogger.Info("تم العثور على " + files.Count + " صورة لمعالجتها.");
                    for (int i = 0; i < files.Count; i++) {
                        OcrResultData res = ocrEngine.ProcessImage(files[i]);
                        envelope.images.Add(res);
                    }
                } else if (File.Exists(inputPath)) {
                    OcrResultData res = ocrEngine.ProcessImage(inputPath);
                    envelope.images.Add(res);
                } else {
                    AsyncLogger.Error("خطأ: المسار المحدد غير موجود: " + inputPath);
                    return;
                }

                // Serialize to JSON manually
                string json = SerializeResponse(envelope);
                File.WriteAllText(outputPath, json, Encoding.UTF8);
                AsyncLogger.Info("تم حفظ مخرجات التعرف الضوئي في: " + outputPath);

            } finally {
                ocrEngine.Dispose();
            }
        }

        // ── REST API Server Mode ────────────────────────────────────────────────────
        public static void RunServer(string port) {
            AsyncLogger.Info("بدء تشغيل خادم الويب المحلي (REST API) على المنفذ " + port + "...");
            
            ocrEngine = new OcrEngine();
            if (!ocrEngine.Initialize()) {
                AsyncLogger.Error("خطأ: فشل تهيئة محرك OCR للعمل مع الخادم.");
                return;
            }

            httpListener = new HttpListener();
            httpListener.Prefixes.Add("http://localhost:" + port + "/");
            
            try {
                httpListener.Start();
                isServerRunning = true;
                AsyncLogger.Info("الخادم يعمل الآن بنجاح. يمكنك إرسال الطلبات إلى http://localhost:" + port + "/api/ocr");

                ThreadPool.QueueUserWorkItem((state) => {
                    while (isServerRunning) {
                        try {
                            HttpListenerContext ctx = httpListener.GetContext();
                            ThreadPool.QueueUserWorkItem(ProcessHttpRequest, ctx);
                        } catch (Exception ex) {
                            if (!isServerRunning) break;
                            AsyncLogger.Error("خطأ في استقبال الاتصال: " + ex.Message);
                        }
                    }
                });

                // Wait until manually terminated in server mode
                Console.WriteLine("اضغط على Ctrl+C أو قم بإنهاء العملية لإيقاف الخادم...");
                while (isServerRunning) {
                    Thread.Sleep(1000);
                }

            } catch (Exception ex) {
                AsyncLogger.Error("فشل تشغيل الخادم: " + ex.Message);
            } finally {
                StopServer();
            }
        }

        public static void StopServer() {
            if (isServerRunning) {
                isServerRunning = false;
                if (httpListener != null) {
                    try { httpListener.Stop(); } catch { }
                    httpListener = null;
                }
                if (ocrEngine != null) {
                    ocrEngine.Dispose();
                    ocrEngine = null;
                }
                AsyncLogger.Info("تم إيقاف خادم الويب المحلي.");
            }
        }

        private static void ProcessHttpRequest(object state) {
            HttpListenerContext ctx = (HttpListenerContext)state;
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse resp = ctx.Response;

            // Enable CORS
            resp.Headers.Add("Access-Control-Allow-Origin", "*");
            resp.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
            resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            if (req.HttpMethod == "OPTIONS") {
                resp.StatusCode = (int)HttpStatusCode.OK;
                resp.Close();
                return;
            }

            AsyncLogger.Info("طلب وارد: " + req.HttpMethod + " " + req.Url.LocalPath);

            if (req.Url.LocalPath != "/api/ocr") {
                SendTextResponse(resp, HttpStatusCode.NotFound, "{\"error\": \"Endpoint not found\"}");
                return;
            }

            try {
                string imagePath = null;

                // Support GET/POST with path query parameter: /api/ocr?path=...
                if (!string.IsNullOrEmpty(req.QueryString["path"])) {
                    imagePath = req.QueryString["path"];
                }

                // If no path, support raw binary POST upload
                if (string.IsNullOrEmpty(imagePath) && req.HttpMethod == "POST") {
                    // Save uploaded bytes to a temp file
                    string tempFile = Path.Combine(Path.GetTempPath(), "oneocr_upload_" + Guid.NewGuid().ToString() + ".jpg");
                    using (FileStream fs = new FileStream(tempFile, FileMode.Create, FileAccess.Write)) {
                        req.InputStream.CopyTo(fs);
                    }
                    imagePath = tempFile;
                }

                if (string.IsNullOrEmpty(imagePath) || !File.Exists(imagePath)) {
                    SendTextResponse(resp, HttpStatusCode.BadRequest, "{\"error\": \"Image path invalid or no file uploaded\"}");
                    return;
                }

                // Process image
                OcrResultData result = ocrEngine.ProcessImage(imagePath);
                
                // Clean up temp file if it was created
                if (imagePath.Contains("oneocr_upload_")) {
                    try { File.Delete(imagePath); } catch { }
                }

                OcrResponseEnvelope env = new OcrResponseEnvelope();
                env.images.Add(result);

                string json = SerializeResponse(env);
                SendTextResponse(resp, HttpStatusCode.OK, json);

            } catch (Exception ex) {
                AsyncLogger.Error("خطأ في معالجة طلب الويب: " + ex.Message);
                SendTextResponse(resp, HttpStatusCode.InternalServerError, "{\"error\": \"" + EscapeJson(ex.Message) + "\"}");
            }
        }

        private static void SendTextResponse(HttpListenerResponse resp, HttpStatusCode code, string body) {
            try {
                resp.StatusCode = (int)code;
                resp.ContentType = "application/json; charset=utf-8";
                byte[] bytes = Encoding.UTF8.GetBytes(body);
                resp.ContentLength64 = bytes.Length;
                resp.OutputStream.Write(bytes, 0, bytes.Length);
                resp.Close();
            } catch (Exception ex) {
                AsyncLogger.Error("خطأ في إرسال استجابة HTTP: " + ex.Message);
            }
        }

        private static void RunGui() {
            AsyncLogger.Info("بدء تشغيل الواجهة الرسومية (GUI)...");
            try {
                var app = new System.Windows.Application();
                
                app.DispatcherUnhandledException += (s, e) => {
                    AsyncLogger.Error("استثناء غير معالج في Dispatcher للتطبيق: " + e.Exception.ToString());
                    MessageBox.Show("حدث خطأ غير متوقع في الواجهة الرسومية:\n" + e.Exception.Message, "OneOCR Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    e.Handled = true;
                };

                app.Startup += (s, e) => {
                    AsyncLogger.Info("حدث Startup للتطبيق. بدء إنشاء MainWindow...");
                    try {
                        var window = new OneOcr.Gui.MainWindow();
                        AsyncLogger.Info("تم إنشاء MainWindow بنجاح. جاري عرضه...");
                        window.Show();
                    } catch (Exception ex) {
                        AsyncLogger.Error("فشل إنشاء أو عرض MainWindow: " + ex.ToString());
                        MessageBox.Show("فشل بدء واجهة المستخدم:\n" + ex.Message, "OneOCR Initialization Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        Environment.Exit(1);
                    }
                };
                
                AsyncLogger.Info("استدعاء Application.Run()...");
                app.Run();
            } catch (Exception ex) {
                AsyncLogger.Error("خطأ في إطلاق الواجهة الرسومية: " + ex.ToString());
                Console.WriteLine("حدث خطأ في تشغيل الواجهة الرسومية. يرجى مراجعة سجل التتبع.");
                MessageBox.Show("خطأ حرج في إطلاق الواجهة:\n" + ex.Message, "OneOCR Fatal Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        // ── Helpers ─────────────────────────────────────────────────────────────────
        private static string SerializeResponse(OcrResponseEnvelope env) {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("  \"images\": [");
            for (int i = 0; i < env.images.Count; i++) {
                var img = env.images[i];
                sb.AppendLine("    {");
                sb.AppendLine("      \"image_path\": \"" + EscapeJson(img.image_path) + "\",");
                sb.AppendLine("      \"angle\": " + img.angle.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",");
                sb.AppendLine("      \"text\": \"" + EscapeJson(img.text) + "\",");
                sb.AppendLine("      \"lines\": [");
                for (int j = 0; j < img.lines.Count; j++) {
                    var ln = img.lines[j];
                    sb.AppendLine("        {");
                    sb.AppendLine("          \"index\": " + ln.index + ",");
                    sb.AppendLine("          \"text\": \"" + EscapeJson(ln.text) + "\",");
                    sb.AppendLine("          \"bbox\": " + FormatBbox(ln.bbox) + ",");
                    sb.AppendLine("          \"words\": [");
                    for (int k = 0; k < ln.words.Count; k++) {
                        var wd = ln.words[k];
                        sb.AppendLine("            {");
                        sb.AppendLine("              \"index\": " + wd.index + ",");
                        sb.AppendLine("              \"text\": \"" + EscapeJson(wd.text) + "\",");
                        sb.AppendLine("              \"confidence\": " + wd.confidence.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",");
                        sb.AppendLine("              \"bbox\": " + FormatBbox(wd.bbox));
                        if (k < ln.words.Count - 1) sb.AppendLine("            },");
                        else sb.AppendLine("            }");
                    }
                    sb.AppendLine("          ]");
                    if (j < img.lines.Count - 1) sb.AppendLine("        },");
                    else sb.AppendLine("        }");
                }
                sb.AppendLine("      ]");
                if (i < env.images.Count - 1) sb.AppendLine("    },");
                else sb.AppendLine("    }");
            }
            sb.AppendLine("  ]");
            sb.AppendLine("}");
            return sb.ToString();
        }

        private static string FormatBbox(BoundingBox box) {
            return "{\"x1\": " + box.x1.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) +
                   ", \"y1\": " + box.y1.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) +
                   ", \"x2\": " + box.x2.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) +
                   ", \"y2\": " + box.y2.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) +
                   ", \"x3\": " + box.x3.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) +
                   ", \"y3\": " + box.y3.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) +
                   ", \"x4\": " + box.x4.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) +
                   ", \"y4\": " + box.y4.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) + "}";
        }

        private static string EscapeJson(string s) {
            if (string.IsNullOrEmpty(s)) return string.Empty;
            StringBuilder sb = new StringBuilder();
            foreach (char c in s) {
                switch (c) {
                    case '\\': sb.Append("\\\\"); break;
                    case '\"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32) sb.AppendFormat("\\u{0:x4}", (int)c);
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }
    }
}
