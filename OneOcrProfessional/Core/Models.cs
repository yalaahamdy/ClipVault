using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace OneOcr.Core {
    [StructLayout(LayoutKind.Sequential)]
    public struct ImageStructure {
        public int type;
        public int width;
        public int height;
        public int reserved;
        public long step_size;
        public IntPtr data_ptr;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct BoundingBox {
        public float x1, y1;
        public float x2, y2;
        public float x3, y3;
        public float x4, y4;
    }

    public class WordData {
        public int index { get; set; }
        public string text { get; set; }
        public float confidence { get; set; }
        public BoundingBox bbox { get; set; }
    }

    public class LineData {
        public int index { get; set; }
        public string text { get; set; }
        public BoundingBox bbox { get; set; }
        public List<WordData> words { get; set; }

        public LineData() {
            words = new List<WordData>();
        }
    }

    public class OcrResultData {
        public string image_path { get; set; }
        public float angle { get; set; }
        public string text { get; set; }
        public List<LineData> lines { get; set; }

        public OcrResultData() {
            lines = new List<LineData>();
        }
    }

    public class OcrResponseEnvelope {
        public List<OcrResultData> images { get; set; }

        public OcrResponseEnvelope() {
            images = new List<OcrResultData>();
        }
    }
}
