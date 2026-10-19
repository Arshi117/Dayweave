using System;
using System.ComponentModel;
using System.Reflection;
using System.Runtime.InteropServices;

namespace Dayweave.Native
{
    // This helper only reparents the HWND owned by the calling Dayweave process.
    // Explorer owns the desktop hosts; we never hide, resize, or destroy them.
    public sealed class DesktopHost : IDisposable
    {
        const int GWL_STYLE = -16, GWL_EXSTYLE = -20, GWLP_HWNDPARENT = -8;
        const uint WS_CHILD = 0x40000000, WS_POPUP = 0x80000000;
        const uint WS_EX_LAYERED = 0x00080000, WS_EX_TRANSPARENT = 0x20;
        const uint WS_EX_NOACTIVATE = 0x08000000, WS_EX_TOOLWINDOW = 0x80;
        const uint WS_EX_APPWINDOW = 0x00040000, WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
        const uint SWP_NOSIZE = 0x1, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20;
        readonly IntPtr window;
        readonly uint ownerPid, originalStyle, originalExStyle;
        readonly IntPtr originalParent;
        IntPtr host, icons, progman, iconHost;
        IntPtr control, controlParent;
        uint controlStyle, controlExStyle;
        int controlX, controlY, controlWidth, controlHeight;
        uint shellPid;
        bool attached, visible;
        int x, y, width, height;
        public string Strategy { get; private set; }

        public DesktopHost(long handle, uint processId)
        {
            window = new IntPtr(handle);
            ownerPid = processId;
            RequireOwnWindow();
            originalStyle = GetWindowLong(window, GWL_STYLE);
            originalExStyle = GetWindowLong(window, GWL_EXSTYLE);
            originalParent = GetParent(window);
            Strategy = "none";
        }

        void RequireOwnWindow()
        {
            uint actual;
            GetWindowThreadProcessId(window, out actual);
            if (!IsWindow(window) || actual != ownerPid)
                throw new InvalidOperationException("The Dayweave window no longer exists.");
        }

        static void Check(bool result, string operation)
        {
            if (!result) throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
        }

        static void ChangeStyle(IntPtr hwnd, int index, uint value)
        {
            SetLastError(0);
            uint previous = SetWindowLong(hwnd, index, value);
            int error = Marshal.GetLastWin32Error();
            if (previous == 0 && error != 0) throw new Win32Exception(error, "SetWindowLong");
        }

        static void ChangeOwner(IntPtr hwnd, IntPtr owner)
        {
            SetLastError(0);
            IntPtr previous = IntPtr.Size == 8
                ? SetWindowLongPtr(hwnd, GWLP_HWNDPARENT, owner)
                : new IntPtr(unchecked((int)SetWindowLong(hwnd, GWLP_HWNDPARENT, unchecked((uint)owner.ToInt32()))));
            int error = Marshal.GetLastWin32Error();
            if (previous == IntPtr.Zero && error != 0) throw new Win32Exception(error, "Set window owner");
        }

        public string Attach(int left, int top, int w, int h)
        {
            RequireOwnWindow();
            progman = FindWindow("Progman", null);
            if (progman == IntPtr.Zero) throw new InvalidOperationException("Windows desktop is not ready.");
            GetWindowThreadProcessId(progman, out shellPid);
            UIntPtr unused;
            // Explorer's wallpaper host discovery is undocumented and may change.
            SendMessageTimeout(progman, 0x052C, new UIntPtr(0xD), IntPtr.Zero, 2, 1000, out unused);
            SendMessageTimeout(progman, 0x052C, new UIntPtr(0xD), new IntPtr(1), 2, 1000, out unused);
            icons = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            IntPtr childWallpaper = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
            bool raised = (GetWindowLong(progman, GWL_EXSTYLE) & WS_EX_NOREDIRECTIONBITMAP) != 0;
            if (raised && icons != IntPtr.Zero && childWallpaper != IntPtr.Zero)
            {
                host = progman;
                iconHost = progman;
                Strategy = "raised-desktop";
            }
            else
            {
                host = IntPtr.Zero;
                EnumWindows(delegate(IntPtr candidate, IntPtr parameter)
                {
                    uint candidatePid;
                    GetWindowThreadProcessId(candidate, out candidatePid);
                    if (candidatePid != shellPid || FindWindowEx(candidate, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero) return true;
                    IntPtr sibling = FindWindowEx(IntPtr.Zero, candidate, "WorkerW", null);
                    uint siblingPid;
                    GetWindowThreadProcessId(sibling, out siblingPid);
                    if (sibling != IntPtr.Zero && siblingPid == shellPid
                        && FindWindowEx(sibling, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero)
                    {
                        host = sibling;
                        iconHost = candidate;
                        return false;
                    }
                    return true;
                }, IntPtr.Zero);
                icons = IntPtr.Zero;
                Strategy = "workerw";
            }
            if (host == IntPtr.Zero || !IsWindowVisible(host))
                throw new InvalidOperationException("No supported Windows wallpaper host was found.");
            IntPtr previousDpi = SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(window));
            try
            {
                ShowWindow(window, 0);
                ChangeStyle(window, GWL_STYLE, (originalStyle & ~WS_POPUP) | WS_CHILD);
                ChangeStyle(window, GWL_EXSTYLE, (originalExStyle & ~WS_EX_APPWINDOW)
                    | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
                Check(SetLayeredWindowAttributes(window, 0, 255, 2), "SetLayeredWindowAttributes");
                SetLastError(0);
                IntPtr previous = SetParent(window, host);
                int error = Marshal.GetLastWin32Error();
                if (previous == IntPtr.Zero && error != 0) throw new Win32Exception(error, "SetParent");
                attached = GetParent(window) == host;
                if (!attached) throw new InvalidOperationException("Windows did not attach the calendar to the desktop.");
                Resize(left, top, w, h);
                return Strategy;
            }
            catch
            {
                Dispose();
                throw;
            }
            finally { if (previousDpi != IntPtr.Zero) SetThreadDpiAwarenessContext(previousDpi); }
        }

        public bool IsAttached()
        {
            uint actual, desktopOwner;
            GetWindowThreadProcessId(window, out actual);
            GetWindowThreadProcessId(host, out desktopOwner);
            return attached && IsWindow(window) && actual == ownerPid && IsWindow(host)
                && desktopOwner == shellPid && GetParent(window) == host
                && FindWindow("Progman", null) == progman
                && (control == IntPtr.Zero || IsControlAttached());
        }

        bool IsControlAttached()
        {
            uint actual, parentOwner;
            GetWindowThreadProcessId(control, out actual);
            GetWindowThreadProcessId(iconHost, out parentOwner);
            return IsWindow(control) && actual == ownerPid && IsWindow(iconHost)
                && parentOwner == shellPid && GetWindow(control, 4) == iconHost;
        }

        public void AttachControl(long handle, int left, int top, int w, int h)
        {
            if (control != IntPtr.Zero) throw new InvalidOperationException("Desktop control is already attached.");
            if (!IsAttached() || iconHost == IntPtr.Zero) throw new InvalidOperationException("Desktop is unavailable.");
            IntPtr candidate = new IntPtr(handle);
            uint actual;
            GetWindowThreadProcessId(candidate, out actual);
            if (!IsWindow(candidate) || actual != ownerPid || candidate == window)
                throw new InvalidOperationException("Invalid Dayweave control window.");
            control = candidate;
            controlParent = GetWindow(control, 4); // GW_OWNER
            controlStyle = GetWindowLong(control, GWL_STYLE);
            controlExStyle = GetWindowLong(control, GWL_EXSTYLE);
            try
            {
                ShowWindow(control, 0);
                // Keep Chromium's input widget a top-level window. Reparenting it
                // as an Explorer child breaks mouse routing after hide/show.
                ChangeStyle(control, GWL_STYLE, (controlStyle & ~WS_CHILD) | WS_POPUP);
                ChangeStyle(control, GWL_EXSTYLE, (controlExStyle & ~(WS_EX_APPWINDOW | WS_EX_TRANSPARENT))
                    | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
                ChangeOwner(control, iconHost);
                if (!IsControlAttached()) throw new InvalidOperationException("Desktop control could not be attached.");
                ResizeControl(left, top, w, h);
            }
            catch { DisposeControl(); throw; }
        }

        public void ResizeControl(int left, int top, int w, int h)
        {
            if (w < 1 || h < 1) throw new ArgumentOutOfRangeException("controlSize");
            controlX = left; controlY = top; controlWidth = w; controlHeight = h;
            PositionControl();
        }

        void PositionControl()
        {
            if (!IsControlAttached()) throw new InvalidOperationException("Desktop control was disconnected.");
            IntPtr previousDpi = SetThreadDpiAwarenessContext(new IntPtr(-4));
            try
            {
                // Put the owned tool window immediately above the desktop, below
                // application windows. Ownership keeps it with the desktop shell.
                IntPtr previous = GetWindow(iconHost, 3); // GW_HWNDPREV
                if (previous == control) previous = GetWindow(control, 3);
                // Electron owns its content size and transparent window margins.
                // Repeated native frame resizing would progressively clip the button.
                Check(SetWindowPos(control, previous, controlX, controlY, controlWidth, controlHeight,
                    SWP_NOACTIVATE | SWP_NOSIZE), "Control SetWindowPos");
            }
            finally { if (previousDpi != IntPtr.Zero) SetThreadDpiAwarenessContext(previousDpi); }
        }

        void DisposeControl()
        {
            uint actual;
            GetWindowThreadProcessId(control, out actual);
            if (IsWindow(control) && actual == ownerPid)
            {
                ShowWindow(control, 0);
                ChangeOwner(control, IsWindow(controlParent) ? controlParent : IntPtr.Zero);
                SetWindowLong(control, GWL_STYLE, controlStyle);
                SetWindowLong(control, GWL_EXSTYLE, controlExStyle);
            }
            control = IntPtr.Zero;
        }

        void Position()
        {
            if (!IsAttached()) throw new InvalidOperationException("The Windows desktop connection was lost.");
            // Coordinates received from Electron are physical screen pixels.
            IntPtr previousDpi = SetThreadDpiAwarenessContext(new IntPtr(-4));
            try
            {
                POINT point = new POINT { X = x, Y = y };
                Check(ScreenToClient(host, ref point), "ScreenToClient");
                // Insert immediately below icons on the raised desktop, or at the
                // top of the classic wallpaper host. The normal wallpaper stays below.
                IntPtr insertAfter = icons == IntPtr.Zero ? IntPtr.Zero : icons;
                if (icons != IntPtr.Zero && (!IsWindow(icons) || GetParent(icons) != host))
                    throw new InvalidOperationException("Desktop icon layer changed.");
                Check(SetWindowPos(window, insertAfter, point.X, point.Y, width, height,
                    SWP_NOACTIVATE | SWP_FRAMECHANGED), "SetWindowPos");
            }
            finally { if (previousDpi != IntPtr.Zero) SetThreadDpiAwarenessContext(previousDpi); }
        }

        public void Resize(int left, int top, int w, int h)
        {
            if (w < 1 || h < 1) throw new ArgumentOutOfRangeException("size");
            x = left; y = top; width = w; height = h;
            Position();
        }

        public void SetVisible(bool show)
        {
            RequireOwnWindow();
            if (show) { Position(); if (control != IntPtr.Zero) PositionControl(); }
            visible = show;
            ShowWindow(window, show ? 4 : 0); // SW_SHOWNOACTIVATE / SW_HIDE
            if (control != IntPtr.Zero) ShowWindow(control, show ? 4 : 0);
        }

        public void ShowDesktop()
        {
            Type shellType = Type.GetTypeFromProgID("Shell.Application");
            if (shellType == null) throw new InvalidOperationException("Windows desktop is unavailable.");
            object shell = Activator.CreateInstance(shellType);
            try
            {
                shellType.InvokeMember("MinimizeAll", BindingFlags.InvokeMethod, null, shell, null);
                if (IsIconic(progman)) ShowWindow(progman, 9); // SW_RESTORE
                // Electron must reveal the calendar and control first. Showing
                // their HWNDs here can leave Chromium's input child hidden.
            }
            finally { if (Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell); }
        }

        public bool Refresh()
        {
            if (!IsAttached()) return false;
            if (visible) { Position(); if (control != IntPtr.Zero) PositionControl(); }
            return true;
        }

        public void Dispose()
        {
            DisposeControl();
            uint actual;
            GetWindowThreadProcessId(window, out actual);
            if (IsWindow(window) && actual == ownerPid)
            {
                ShowWindow(window, 0);
                SetParent(window, IsWindow(originalParent) ? originalParent : IntPtr.Zero);
                SetWindowLong(window, GWL_STYLE, originalStyle);
                SetWindowLong(window, GWL_EXSTYLE, originalExStyle);
            }
            attached = false;
        }

        [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
        delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr parameter);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string className, string title);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
        [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
        [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
        [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
        [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint command);
        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetParent(IntPtr hwnd, IntPtr parent);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern uint GetWindowLong(IntPtr hwnd, int index);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)] static extern uint SetWindowLong(IntPtr hwnd, int index, uint value);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
        [DllImport("user32.dll", SetLastError = true)] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
        [DllImport("user32.dll", SetLastError = true)] static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint key, byte alpha, uint flags);
        [DllImport("user32.dll", SetLastError = true)] static extern bool ScreenToClient(IntPtr hwnd, ref POINT point);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
        [DllImport("user32.dll")] static extern IntPtr GetWindowDpiAwarenessContext(IntPtr hwnd);
        [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
        [DllImport("kernel32.dll")] static extern void SetLastError(uint error);
    }
}
