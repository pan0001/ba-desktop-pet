using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

// Read-only geometry service. No titles, content, screenshots or input hooks.
class WindowGeometry {
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int L, T, R, B; }
    delegate bool Callback(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(Callback fn, IntPtr data);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder value, int count);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out Rect rect, int size);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
    static uint excluded;
    static string Scan() {
        var items = new List<string>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr unused) {
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            if (pid == excluded || !IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
            int cloaked; if (DwmGetWindowAttribute(hwnd, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
            var cls = new StringBuilder(256); GetClassName(hwnd, cls, 256);
            string name = cls.ToString();
            if (name == "Progman" || name == "WorkerW" || name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd") return true;
            long exStyle = GetWindowLongPtr(hwnd, -20).ToInt64();
            if ((exStyle & 0x20) != 0) return true; // click-through overlays are not solid platforms
            Rect r;
            if (DwmGetWindowAttribute(hwnd, 9, out r, Marshal.SizeOf(typeof(Rect))) != 0 && !GetWindowRect(hwnd, out r)) return true;
            int w = r.R - r.L, h = r.B - r.T;
            if (w < 8 || h < 8 || Math.Abs((long)r.L) > 100000 || Math.Abs((long)r.T) > 100000) return true;
            bool stand = w >= 160 && h >= 80 && (exStyle & 0x80) == 0;
            items.Add("{\"id\":\"" + hwnd.ToInt64() + ":" + pid + "\",\"x\":" + r.L + ",\"y\":" + r.T + ",\"width\":" + w + ",\"height\":" + h + ",\"standable\":" + (stand ? "true" : "false") + "}");
            return true;
        }, IntPtr.Zero);
        return "[" + string.Join(",", items.ToArray()) + "]";
    }
    static void Main(string[] args) {
        if (args.Length > 0) uint.TryParse(args[0], out excluded);
        try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { }
        string command;
        while ((command = Console.ReadLine()) != null) {
            if (command == "quit") break;
            if (command != "scan") continue;
            try { Console.WriteLine(Scan()); } catch { Console.WriteLine("[]"); }
            Console.Out.Flush();
        }
    }
}
