using System;
using System.Runtime.InteropServices;

namespace OneOcr.Core {
    public static class NativeMethods {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr LoadLibraryW(string path);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long CreateOcrInitOptions(out long outOptions);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long OcrInitOptionsSetUseModelDelayLoad(long options, byte useDelay);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long CreateOcrPipeline(byte[] modelPath, byte[] key, long options, out long outPipeline);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long CreateOcrProcessOptions(out long outOptions);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long OcrProcessOptionsSetMaxRecognitionLineCount(long options, long maxLines);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long RunOcrPipeline(long pipeline, ref ImageStructure imageStruct, long options, out long outResult);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetImageAngle(long result, out float outAngle);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrLineCount(long result, out long outCount);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrLine(long result, long lineIndex, out long outLine);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrLineContent(long line, out IntPtr outTextPtr);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrLineBoundingBox(long line, out IntPtr outBoxPtrPtr);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrLineWordCount(long line, out long outCount);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrWord(long line, long wordIndex, out long outWord);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrWordContent(long word, out IntPtr outTextPtr);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrWordBoundingBox(long word, out IntPtr outBoxPtrPtr);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern long GetOcrWordConfidence(long word, out float outConfidence);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void ReleaseOcrResult(long result);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void ReleaseOcrInitOptions(long options);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void ReleaseOcrPipeline(long pipeline);

        [DllImport("oneocr.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void ReleaseOcrProcessOptions(long options);
    }
}
