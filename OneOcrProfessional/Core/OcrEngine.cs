using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Diagnostics;

namespace OneOcr.Core {
    public class OcrEngine : IDisposable {
        private IntPtr _hDll = IntPtr.Zero;
        private long _initOptions = 0;
        private long _pipeline = 0;
        private long _processOptions = 0;
        private bool _isInitialized = false;

        private bool _rtlLayoutMode = false;
        public bool RtlLayoutMode {
            get { return _rtlLayoutMode; }
            set { _rtlLayoutMode = value; }
        }

        public event Action<string, long> OnStepProgress;

        public bool IsInitialized {
            get { return _isInitialized; }
        }

        public OcrEngine() {
        }

        private void RaiseProgress(string step, long elapsedMs) {
            if (OnStepProgress != null) {
                OnStepProgress(step, elapsedMs);
            }
        }

        public bool Initialize() {
            if (_isInitialized) return true;

            Stopwatch sw = Stopwatch.StartNew();
            AsyncLogger.Info("بدء تهيئة محرك OneOCR...");

            try {
                // 1. Load DLL
                RaiseProgress("تحميل المكتبات", sw.ElapsedMilliseconds);
                _hDll = NativeMethods.LoadLibraryW("oneocr.dll");
                if (_hDll == IntPtr.Zero) {
                    AsyncLogger.Error("فشل تحميل oneocr.dll. رمز الخطأ: " + Marshal.GetLastWin32Error());
                    return false;
                }

                // 2. Init Options
                long status = NativeMethods.CreateOcrInitOptions(out _initOptions);
                if (status != 0) {
                    AsyncLogger.Error("CreateOcrInitOptions status: " + status);
                    return false;
                }
                NativeMethods.OcrInitOptionsSetUseModelDelayLoad(_initOptions, 0);

                // 3. Create Pipeline
                string modelPath = "oneocr.onemodel";
                if (!File.Exists(modelPath)) {
                    AsyncLogger.Error("oneocr.onemodel غير موجود!");
                    return false;
                }

                byte[] modelPathBytes = Encoding.UTF8.GetBytes(modelPath + "\0");
                byte[] keyBytes = Encoding.ASCII.GetBytes("kj)TGtrK>f]b[Piow.gU+nC@s\"\"\"\"\"\"4\0");

                status = NativeMethods.CreateOcrPipeline(modelPathBytes, keyBytes, _initOptions, out _pipeline);
                if (status != 0 || _pipeline == 0) {
                    AsyncLogger.Error("CreateOcrPipeline status: " + status);
                    return false;
                }

                // 4. Process Options
                status = NativeMethods.CreateOcrProcessOptions(out _processOptions);
                if (status != 0) {
                    AsyncLogger.Error("CreateOcrProcessOptions status: " + status);
                    return false;
                }
                NativeMethods.OcrProcessOptionsSetMaxRecognitionLineCount(_processOptions, 1000);

                _isInitialized = true;
                RaiseProgress("تهيئة ناجحة", sw.ElapsedMilliseconds);
                AsyncLogger.Info("تمت تهيئة محرك OneOCR بنجاح في " + sw.ElapsedMilliseconds + " ميلي ثانية.");
                return true;

            } catch (Exception ex) {
                AsyncLogger.Error("حدث خطأ أثناء تهيئة المحرك: " + ex.Message);
                return false;
            }
        }

        public OcrResultData ProcessImage(string imagePath) {
            if (!_isInitialized && !Initialize()) {
                throw new InvalidOperationException("فشل تهيئة المحرك.");
            }

            Stopwatch sw = Stopwatch.StartNew();
            AsyncLogger.Info("بدء معالجة الصورة: " + Path.GetFileName(imagePath));

            OcrResultData resultData = new OcrResultData();
            resultData.image_path = imagePath;

            if (!File.Exists(imagePath)) {
                AsyncLogger.Error("الصورة غير موجودة: " + imagePath);
                return resultData;
            }

            long currentElapsed = sw.ElapsedMilliseconds;

            using (Bitmap bmp = new Bitmap(imagePath)) {
                // 1. Prepare pixels
                RaiseProgress("تحويل وتجهيز البكسلات (BGRA)", sw.ElapsedMilliseconds - currentElapsed);
                currentElapsed = sw.ElapsedMilliseconds;

                BitmapData bmpData = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                try {
                    ImageStructure imgStruct = new ImageStructure();
                    imgStruct.type = 3;
                    imgStruct.width = bmp.Width;
                    imgStruct.height = bmp.Height;
                    imgStruct.reserved = 0;
                    imgStruct.step_size = bmpData.Stride;
                    imgStruct.data_ptr = bmpData.Scan0;

                    // 2. Run OCR
                    RaiseProgress("تشغيل النموذج العصبي", sw.ElapsedMilliseconds - currentElapsed);
                    currentElapsed = sw.ElapsedMilliseconds;

                    long resultHandle = 0;
                    long status = NativeMethods.RunOcrPipeline(_pipeline, ref imgStruct, _processOptions, out resultHandle);
                    
                    RaiseProgress("تحليل وقراءة البيانات المستخرجة", sw.ElapsedMilliseconds - currentElapsed);
                    currentElapsed = sw.ElapsedMilliseconds;

                    if (status == 0 && resultHandle != 0) {
                        float angle = 0;
                        NativeMethods.GetImageAngle(resultHandle, out angle);
                        resultData.angle = angle;

                        long lineCount = 0;
                        NativeMethods.GetOcrLineCount(resultHandle, out lineCount);

                        List<string> fullTextList = new List<string>();

                        for (long i = 0; i < lineCount; i++) {
                            long lineHandle = 0;
                            NativeMethods.GetOcrLine(resultHandle, i, out lineHandle);
                            if (lineHandle != 0) {
                                LineData lineData = new LineData();
                                lineData.index = (int)i;

                                IntPtr textPtr;
                                NativeMethods.GetOcrLineContent(lineHandle, out textPtr);
                                lineData.text = ReadUtf8String(textPtr);
                                fullTextList.Add(lineData.text);

                                IntPtr boxPtr;
                                NativeMethods.GetOcrLineBoundingBox(lineHandle, out boxPtr);
                                lineData.bbox = (BoundingBox)Marshal.PtrToStructure(boxPtr, typeof(BoundingBox));

                                // Read Words
                                long wordCount = 0;
                                NativeMethods.GetOcrLineWordCount(lineHandle, out wordCount);
                                for (long j = 0; j < wordCount; j++) {
                                    long wordHandle = 0;
                                    NativeMethods.GetOcrWord(lineHandle, j, out wordHandle);
                                    if (wordHandle != 0) {
                                        WordData wordData = new WordData();
                                        wordData.index = (int)j;

                                        IntPtr wordTextPtr;
                                        NativeMethods.GetOcrWordContent(wordHandle, out wordTextPtr);
                                        wordData.text = ReadUtf8String(wordTextPtr);

                                        float conf = 0;
                                        NativeMethods.GetOcrWordConfidence(wordHandle, out conf);
                                        wordData.confidence = conf;

                                        IntPtr wordBoxPtr;
                                        NativeMethods.GetOcrWordBoundingBox(wordHandle, out wordBoxPtr);
                                        wordData.bbox = (BoundingBox)Marshal.PtrToStructure(wordBoxPtr, typeof(BoundingBox));

                                        lineData.words.Add(wordData);
                                    }
                                }

                                resultData.lines.Add(lineData);
                            }
                        }

                        // Perform intelligent layout analysis to group and sort lines into reading order and format output
                        string formattedText;
                        resultData.lines = PerformLayoutAnalysis(resultData.lines, out formattedText);
                        resultData.text = formattedText;
                        NativeMethods.ReleaseOcrResult(resultHandle);
                    } else {
                        AsyncLogger.Error("فشل RunOcrPipeline. رمز الحالة: " + status);
                    }

                } finally {
                    bmp.UnlockBits(bmpData);
                }
            }

            RaiseProgress("اكتمال المعالجة والرسم", sw.ElapsedMilliseconds - currentElapsed);
            AsyncLogger.Info("تمت معالجة الصورة " + Path.GetFileName(imagePath) + " بنجاح في " + sw.ElapsedMilliseconds + " ميلي ثانية.");
            return resultData;
        }

        private string ReadUtf8String(IntPtr ptr) {
            if (ptr == IntPtr.Zero) return string.Empty;
            List<byte> bytes = new List<byte>();
            int offset = 0;
            while (true) {
                byte b = Marshal.ReadByte(ptr, offset++);
                if (b == 0) break;
                bytes.Add(b);
            }
            return Encoding.UTF8.GetString(bytes.ToArray());
        }

        public void Dispose() {
            if (_processOptions != 0) {
                NativeMethods.ReleaseOcrProcessOptions(_processOptions);
                _processOptions = 0;
            }
            if (_pipeline != 0) {
                NativeMethods.ReleaseOcrPipeline(_pipeline);
                _pipeline = 0;
            }
            if (_initOptions != 0) {
                NativeMethods.ReleaseOcrInitOptions(_initOptions);
                _initOptions = 0;
            }
            _isInitialized = false;
            AsyncLogger.Info("تم تحرير موارد محرك OCR بنجاح.");
        }

        // ── Layout Analysis and Text Recomposition ─────────────────────────────────
        private class TextBlock {
            public List<LineData> Lines = new List<LineData>();
            public double MinX = double.MaxValue;
            public double MaxX = double.MinValue;
            public double MinY = double.MaxValue;
            public double MaxY = double.MinValue;

            public double Width { get { return MaxX - MinX; } }
            public double Height { get { return MaxY - MinY; } }

            public void AddLine(LineData line) {
                Lines.Add(line);
                UpdateBounds(line.bbox);
            }

            private void UpdateBounds(BoundingBox bbox) {
                double x1 = Math.Min(Math.Min(bbox.x1, bbox.x2), Math.Min(bbox.x3, bbox.x4));
                double x2 = Math.Max(Math.Max(bbox.x1, bbox.x2), Math.Max(bbox.x3, bbox.x4));
                double y1 = Math.Min(Math.Min(bbox.y1, bbox.y2), Math.Min(bbox.y3, bbox.y4));
                double y2 = Math.Max(Math.Max(bbox.y1, bbox.y2), Math.Max(bbox.y3, bbox.y4));

                if (x1 < MinX) MinX = x1;
                if (x2 > MaxX) MaxX = x2;
                if (y1 < MinY) MinY = y1;
                if (y2 > MaxY) MaxY = y2;
            }
        }

        private List<LineData> PerformLayoutAnalysis(List<LineData> rawLines, out string formattedText) {
            formattedText = string.Empty;
            if (rawLines == null || rawLines.Count == 0) return rawLines;

            // Sort lines top-to-bottom first
            List<LineData> sortedRaw = new List<LineData>(rawLines);
            sortedRaw.Sort((a, b) => {
                double aMinY = Math.Min(Math.Min(a.bbox.y1, a.bbox.y2), Math.Min(a.bbox.y3, a.bbox.y4));
                double bMinY = Math.Min(Math.Min(b.bbox.y1, b.bbox.y2), Math.Min(b.bbox.y3, b.bbox.y4));
                return aMinY.CompareTo(bMinY);
            });

            // Precalculate line bounds
            int count = sortedRaw.Count;
            double[] minX = new double[count];
            double[] maxX = new double[count];
            double[] minY = new double[count];
            double[] maxY = new double[count];
            double[] height = new double[count];
            double[] width = new double[count];

            for (int i = 0; i < count; i++) {
                BoundingBox bbox = sortedRaw[i].bbox;
                minX[i] = Math.Min(Math.Min(bbox.x1, bbox.x2), Math.Min(bbox.x3, bbox.x4));
                maxX[i] = Math.Max(Math.Max(bbox.x1, bbox.x2), Math.Max(bbox.x3, bbox.x4));
                minY[i] = Math.Min(Math.Min(bbox.y1, bbox.y2), Math.Min(bbox.y3, bbox.y4));
                maxY[i] = Math.Max(Math.Max(bbox.y1, bbox.y2), Math.Max(bbox.y3, bbox.y4));
                height[i] = maxY[i] - minY[i];
                width[i] = maxX[i] - minX[i];
            }

            // Map each line index to its vertical next-line neighbor index
            Dictionary<int, int> nextLineMap = new Dictionary<int, int>();
            HashSet<int> hasParent = new HashSet<int>();

            for (int i = 0; i < count; i++) {
                int currIdx = i;
                int bestNext = -1;
                double bestDist = double.MaxValue;

                for (int j = i + 1; j < count; j++) {
                    int candIdx = j;
                    if (minY[candIdx] <= minY[currIdx] + 2) continue; // Must be vertically below

                    double yGap = minY[candIdx] - maxY[currIdx];
                    if (yGap < -5) continue; // Allow slight overlap

                    double avgHeight = (height[currIdx] + height[candIdx]) / 2;
                    if (avgHeight < 10) avgHeight = 15;

                    // Threshold: vertical gap should be less than 1.5 * line height
                    if (yGap > avgHeight * 1.5) continue;

                    // Check horizontal overlap
                    double xOverlap = Math.Max(0, Math.Min(maxX[currIdx], maxX[candIdx]) - Math.Max(minX[currIdx], minX[candIdx]));
                    double minW = Math.Min(width[currIdx], width[candIdx]);

                    // Require at least 35% overlap of the smaller line's width
                    if (xOverlap < 0.35 * minW) continue;

                    double dist = yGap;
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestNext = candIdx;
                    }
                }

                if (bestNext != -1 && !hasParent.Contains(bestNext)) {
                    nextLineMap[currIdx] = bestNext;
                    hasParent.Add(bestNext);
                }
            }

            // Build blocks from vertical chains
            List<TextBlock> blocks = new List<TextBlock>();
            HashSet<int> visited = new HashSet<int>();

            for (int i = 0; i < count; i++) {
                if (visited.Contains(i)) continue;

                TextBlock block = new TextBlock();
                int curr = i;
                while (curr != -1) {
                    block.AddLine(sortedRaw[curr]);
                    visited.Add(curr);
                    if (nextLineMap.ContainsKey(curr)) {
                        curr = nextLineMap[curr];
                    } else {
                        curr = -1;
                    }
                }
                blocks.Add(block);
            }

            // Sort lines inside each block top-to-bottom
            foreach (var block in blocks) {
                block.Lines.Sort((a, b) => {
                    double aTop = Math.Min(Math.Min(a.bbox.y1, a.bbox.y2), Math.Min(a.bbox.y3, a.bbox.y4));
                    double bTop = Math.Min(Math.Min(b.bbox.y1, b.bbox.y2), Math.Min(b.bbox.y3, b.bbox.y4));
                    return aTop.CompareTo(bTop);
                });
            }

            // Sort blocks based on reading order (RTL/Manga or LTR)
            blocks.Sort((a, b) => {
                double verticalOverlap = Math.Max(0, Math.Min(a.MaxY, b.MaxY) - Math.Max(a.MinY, b.MinY));
                double minHeight = Math.Min(a.Height, b.Height);

                // If they don't overlap vertically (less than 40% vertical overlap of the smaller block's height), sort by Y (top-to-bottom)
                if (verticalOverlap < minHeight * 0.4) {
                    return a.MinY.CompareTo(b.MinY);
                }

                // If they overlap vertically, sort by X (Right-to-Left for Manga/Arabic, Left-to-Right for English)
                if (RtlLayoutMode) {
                    return b.MaxX.CompareTo(a.MaxX); // Rightmost block first
                } else {
                    return a.MinX.CompareTo(b.MinX); // Leftmost block first
                }
            });

            // Reconstruct sorted list of lines and formatted text (blocks joined by double newlines)
            List<LineData> sortedLines = new List<LineData>();
            List<string> blockTexts = new List<string>();

            foreach (var block in blocks) {
                sortedLines.AddRange(block.Lines);
                
                List<string> lineTexts = new List<string>();
                foreach (var line in block.Lines) {
                    lineTexts.Add(line.text);
                }
                blockTexts.Add(string.Join("\n", lineTexts.ToArray()));
            }

            formattedText = string.Join("\n\n", blockTexts.ToArray());
            return sortedLines;
        }
    }
}
