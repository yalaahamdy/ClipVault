using System;
using System.IO;
using System.Text;

namespace OneOcr.Core {
    public static class AsyncLogger {
        private static string logFilePath = "oneocr_log.txt";
        private static readonly object logLock = new object();

        public static void SetLogFile(string path) {
            logFilePath = path;
        }

        public static void Log(string level, string message) {
            string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
            string formatted = string.Format("[{0}] [{1}] {2}", timestamp, level.ToUpper(), message);
            
            Console.WriteLine(formatted);
            
            lock (logLock) {
                try {
                    File.AppendAllText(logFilePath, formatted + Environment.NewLine, Encoding.UTF8);
                } catch {
                    // Ignore
                }
            }
        }

        public static void Info(string msg) { Log("INFO", msg); }
        public static void Error(string msg) { Log("ERROR", msg); }
        public static void Warn(string msg) { Log("WARN", msg); }
    }
}
