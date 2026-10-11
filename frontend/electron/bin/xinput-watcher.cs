// xinput-watcher.cs — v3.0 (Universal: XInput + Legacy Joystick)
// Compatible con .NET Framework 4.0 (sin string interpolation ni value tuples)
//
// Modos de uso:
//   xinput-watcher.exe <COMBO>      modo normal (monitoreo continuo)
//   xinput-watcher.exe --capture    modo captura: detecta botones y emite combo
//
// Combos predefinidos:
//   SELECT_START  Back+Start (XInput) / Share+Options (PS) [default]
//   L3_R3         LeftThumb+RightThumb
//   L1_R1         LeftShoulder+RightShoulder
//   L2_R2_START   L2+R2+Start (triggers)
//
// Combo personalizado:
//   RAW:<b0>,<b1>,...   indices de boton (Gamepad API 0-based)
//
// Salida modo normal:   OVERLAY_TRIGGER\n
// Salida modo captura:  CAPTURE_START / DEVICE:<name> / COMBO:<b0>,<b1> / DONE / TIMEOUT

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace XInputWatcher {

    [StructLayout(LayoutKind.Sequential)]
    struct XINPUT_GAMEPAD {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct XINPUT_STATE {
        public uint dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOYINFOEX {
        public int dwSize;
        public int dwFlags;
        public int dwXpos, dwYpos, dwZpos, dwRpos, dwUpos, dwVpos;
        public int dwButtons;
        public int dwButtonNumber;
        public int dwPOV;
        public int dwReserved1, dwReserved2;
    }

    class Program {
        // ── XInput ───────────────────────────────────────────────────────────
        [DllImport("xinput1_4.dll", EntryPoint = "#100")]
        static extern int XInputGetStateEx14(int dwUserIndex, ref XINPUT_STATE pState);

        [DllImport("xinput1_3.dll", EntryPoint = "#100")]
        static extern int XInputGetStateEx13(int dwUserIndex, ref XINPUT_STATE pState);

        [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
        static extern int XInputGetState14(int dwUserIndex, ref XINPUT_STATE pState);

        [DllImport("xinput1_3.dll", EntryPoint = "XInputGetState")]
        static extern int XInputGetState13(int dwUserIndex, ref XINPUT_STATE pState);

        static int TryXInputGetState(int userIndex, ref XINPUT_STATE state) {
            try { return XInputGetStateEx14(userIndex, ref state); }
            catch {
                try { return XInputGetStateEx13(userIndex, ref state); }
                catch {
                    try { return XInputGetState14(userIndex, ref state); }
                    catch {
                        try { return XInputGetState13(userIndex, ref state); }
                        catch { return -1; }
                    }
                }
            }
        }

        // ── winmm ────────────────────────────────────────────────────────────
        [DllImport("winmm.dll")] static extern int joyGetNumDevs();
        [DllImport("winmm.dll")] static extern int joyGetPosEx(int uJoyID, ref JOYINFOEX pji);
        const int JOY_RETURNBUTTONS = 0x00000080;
        const int JOYERR_NOERROR   = 0;

        // ── Mapeo XInput buttons → Gamepad API index ─────────────────────────
        // Cada par: (mascara_wButtons, indice_gamepad_api)
        static readonly int[][] XINPUT_BUTTON_MAP = {
            new int[]{0x1000,  0},  // A          → 0 Cross/A
            new int[]{0x2000,  1},  // B          → 1 Circle/B
            new int[]{0x4000,  2},  // X          → 2 Square/X
            new int[]{0x8000,  3},  // Y          → 3 Triangle/Y
            new int[]{0x0100,  4},  // LShoulder  → 4 L1
            new int[]{0x0200,  5},  // RShoulder  → 5 R1
            // btn 6 = L2 (trigger), btn 7 = R2 (trigger) → por threshold
            new int[]{0x0020,  8},  // Back       → 8 Select/Share
            new int[]{0x0010,  9},  // Start      → 9 Start/Options
            new int[]{0x0040, 10},  // LeftThumb  → 10 L3
            new int[]{0x0080, 11},  // RightThumb → 11 R3
            new int[]{0x0001, 12},  // DpadUp     → 12
            new int[]{0x0002, 13},  // DpadDown   → 13
            new int[]{0x0004, 14},  // DpadLeft   → 14
            new int[]{0x0008, 15},  // DpadRight  → 15
            new int[]{0x0400, 16},  // Guide/Home → 16 (Xbox/PS Logo)
        };

        const byte TRIGGER_THRESHOLD = 80;

        // ── Combos predefinidos (indices Gamepad API) ─────────────────────────
        static readonly int[] COMBO_SELECT_START  = { 8, 9 };
        static readonly int[] COMBO_L3_R3         = { 10, 11 };
        static readonly int[] COMBO_L1_R1         = { 4, 5 };
        static readonly int[] COMBO_L2_R2_START   = { 6, 7, 9 };

        // ─────────────────────────────────────────────────────────────────────
        // Helpers
        // ─────────────────────────────────────────────────────────────────────

        static HashSet<int> GetXInputPressed(int userIndex) {
            var result = new HashSet<int>();
            XINPUT_STATE state = new XINPUT_STATE();
            if (TryXInputGetState(userIndex, ref state) != 0) return result;

            ushort btn = state.Gamepad.wButtons;
            foreach (int[] pair in XINPUT_BUTTON_MAP) {
                if ((btn & pair[0]) != 0) result.Add(pair[1]);
            }
            if (state.Gamepad.bLeftTrigger  > TRIGGER_THRESHOLD) result.Add(6);
            if (state.Gamepad.bRightTrigger > TRIGGER_THRESHOLD) result.Add(7);
            return result;
        }

        static HashSet<int> GetLegacyPressed(int joyId) {
            var result = new HashSet<int>();
            JOYINFOEX info = new JOYINFOEX();
            info.dwSize  = Marshal.SizeOf(typeof(JOYINFOEX));
            info.dwFlags = JOY_RETURNBUTTONS;
            try {
                if (joyGetPosEx(joyId, ref info) != JOYERR_NOERROR) return result;
            } catch { return result; }

            int btns = info.dwButtons;
            for (int i = 0; i < 32; i++) {
                if ((btns & (1 << i)) != 0) result.Add(i);
            }
            return result;
        }

        static bool ComboMatches(HashSet<int> pressed, int[] required) {
            foreach (int b in required) {
                if (!pressed.Contains(b)) return false;
            }
            return required.Length > 0;
        }

        static int[] ParseCustomCombo(string arg) {
            string data = null;
            if (arg.StartsWith("RAW:", StringComparison.OrdinalIgnoreCase))
                data = arg.Substring(4);
            else if (arg.StartsWith("CUSTOM:", StringComparison.OrdinalIgnoreCase))
                data = arg.Substring(7);
            if (data == null) return null;

            string[] parts = data.Split(',');
            List<int> idxs = new List<int>();
            foreach (string p in parts) {
                int v;
                if (int.TryParse(p.Trim(), out v)) idxs.Add(v);
            }
            return idxs.Count >= 1 ? idxs.ToArray() : null;
        }

        // ─────────────────────────────────────────────────────────────────────
        // Modo captura
        // ─────────────────────────────────────────────────────────────────────
        const int CAPTURE_TIMEOUT_MS   = 15000;
        const int CAPTURE_POLL_MS      = 50;

        static void RunCaptureMode(StreamWriter stdout) {
            stdout.WriteLine("CAPTURE_START");

            string lastDevice = null;
            int elapsed = 0;
            HashSet<int> peakButtons = new HashSet<int>();
            bool releasedAfterPeak  = false;
            int singleButtonHoldCount = 0;
            int lastSingleButton = -1;

            while (elapsed < CAPTURE_TIMEOUT_MS) {
                HashSet<int> anyPressed = new HashSet<int>();
                string deviceName = null;

                // XInput
                for (int i = 0; i < 4; i++) {
                    HashSet<int> pressed = GetXInputPressed(i);
                    if (pressed.Count > 0) {
                        foreach (int b in pressed) anyPressed.Add(b);
                        if (deviceName == null) deviceName = "XInput#" + i;
                    }
                }

                // Legacy
                int numJoy = joyGetNumDevs();
                for (int j = 0; j < numJoy; j++) {
                    HashSet<int> pressed = GetLegacyPressed(j);
                    if (pressed.Count > 0) {
                        foreach (int b in pressed) anyPressed.Add(b);
                        if (deviceName == null) deviceName = "Joystick#" + j;
                    }
                }

                if (deviceName != null && deviceName != lastDevice) {
                    lastDevice = deviceName;
                    stdout.WriteLine("DEVICE:" + deviceName);
                }

                if (anyPressed.Count >= 2) {
                    singleButtonHoldCount = 0;
                    lastSingleButton = -1;
                    if (anyPressed.Count > peakButtons.Count) {
                        peakButtons = new HashSet<int>(anyPressed);
                    }
                    releasedAfterPeak = false;
                } else if (peakButtons.Count >= 2 && !releasedAfterPeak) {
                    releasedAfterPeak = true;
                    List<int> sorted = new List<int>(peakButtons);
                    sorted.Sort();
                    List<string> parts = new List<string>();
                    foreach (int v in sorted) parts.Add(v.ToString());
                    stdout.WriteLine("COMBO:" + string.Join(",", parts.ToArray()));
                    stdout.WriteLine("DONE");
                    return;
                } else if (anyPressed.Count == 1) {
                    int singleBtn = -1;
                    foreach (int b in anyPressed) { singleBtn = b; break; }
                    if (singleBtn == lastSingleButton) {
                        singleButtonHoldCount++;
                        if (singleButtonHoldCount >= 24) {
                            stdout.WriteLine("COMBO:" + singleBtn.ToString());
                            stdout.WriteLine("DONE");
                            return;
                        }
                    } else {
                        lastSingleButton = singleBtn;
                        singleButtonHoldCount = 1;
                    }
                } else {
                    singleButtonHoldCount = 0;
                    lastSingleButton = -1;
                }

                Thread.Sleep(CAPTURE_POLL_MS);
                elapsed += CAPTURE_POLL_MS;
            }

            stdout.WriteLine("TIMEOUT");
        }

        // ─────────────────────────────────────────────────────────────────────
        // Modo normal (monitoreo continuo)
        // ─────────────────────────────────────────────────────────────────────
        static void RunWatchMode(int[] comboIndices, bool useTriggerFallback, StreamWriter stdout) {
            bool wasMatch = false;

            while (true) {
                bool anyMatch = false;

                // XInput
                for (int i = 0; i < 4; i++) {
                    HashSet<int> pressed = GetXInputPressed(i);
                    bool isMatch;
                    if (useTriggerFallback) {
                        XINPUT_STATE st = new XINPUT_STATE();
                        TryXInputGetState(i, ref st);
                        bool l2    = st.Gamepad.bLeftTrigger  > TRIGGER_THRESHOLD;
                        bool r2    = st.Gamepad.bRightTrigger > TRIGGER_THRESHOLD;
                        bool start = (st.Gamepad.wButtons & 0x0010) != 0;
                        isMatch    = l2 && r2 && start;
                    } else {
                        isMatch = ComboMatches(pressed, comboIndices);
                    }
                    if (isMatch) { anyMatch = true; break; }
                }

                // Legacy
                if (!anyMatch) {
                    int numJoy = joyGetNumDevs();
                    for (int j = 0; j < numJoy; j++) {
                        HashSet<int> pressed = GetLegacyPressed(j);
                        if (pressed.Count > 0 && ComboMatches(pressed, comboIndices)) {
                            anyMatch = true;
                            break;
                        }
                    }
                }

                if (anyMatch && !wasMatch) {
                    wasMatch = true;
                    stdout.WriteLine("OVERLAY_TRIGGER");
                } else if (!anyMatch) {
                    wasMatch = false;
                }

                Thread.Sleep(40);
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // Entry point
        // ─────────────────────────────────────────────────────────────────────
        static void Main(string[] args) {
            StreamWriter stdout = new StreamWriter(Console.OpenStandardOutput());
            stdout.AutoFlush = true;
            Console.SetOut(stdout);

            string arg0 = (args != null && args.Length > 0) ? args[0].Trim() : "";

            if (arg0.Equals("--capture", StringComparison.OrdinalIgnoreCase)) {
                RunCaptureMode(stdout);
                return;
            }

            int[] comboIndices    = null;
            bool useTriggerFallback = false;

            if (!string.IsNullOrEmpty(arg0)) {
                comboIndices = ParseCustomCombo(arg0);
            }

            if (comboIndices == null) {
                if (arg0.Equals("L3_R3", StringComparison.OrdinalIgnoreCase))
                    comboIndices = COMBO_L3_R3;
                else if (arg0.Equals("L1_R1", StringComparison.OrdinalIgnoreCase))
                    comboIndices = COMBO_L1_R1;
                else if (arg0.Equals("L2_R2_START", StringComparison.OrdinalIgnoreCase)) {
                    comboIndices = COMBO_L2_R2_START;
                    useTriggerFallback = true;
                } else {
                    comboIndices = COMBO_SELECT_START;
                }
            }

            RunWatchMode(comboIndices, useTriggerFallback, stdout);
        }
    }
}