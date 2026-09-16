using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace XInputWatcher {
    class Program {

        // ─────────────────────────────────────────────────────────────────
        // XInput (Xbox / mandos con emulación XInput: DS4Windows en modo
        // x360, Steam Input, etc.)
        // ─────────────────────────────────────────────────────────────────
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

        [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
        static extern int XInputGetState14(int dwUserIndex, ref XINPUT_STATE pState);

        [DllImport("xinput1_3.dll", EntryPoint = "XInputGetState")]
        static extern int XInputGetState13(int dwUserIndex, ref XINPUT_STATE pState);

        static int GetXInputState(int userIndex, ref XINPUT_STATE state) {
            try {
                return XInputGetState14(userIndex, ref state);
            } catch {
                try {
                    return XInputGetState13(userIndex, ref state);
                } catch {
                    return -1;
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // Legacy Joystick API (winmm.dll) — así es como Windows expone un
        // mando PlayStation (DualShock 4 / DualSense) que NO tiene emulación
        // XInput: como "HID-compliant game controller" clásico.
        // Nota: si Steam está corriendo con Steam Input activo, el mando
        // físico queda "cloaked" a nivel de driver y no aparecerá aquí
        // tampoco (mismo problema ya documentado para XInput/HidHide).
        // ─────────────────────────────────────────────────────────────────
        [StructLayout(LayoutKind.Sequential)]
        struct JOYINFOEX {
            public int dwSize;
            public int dwFlags;
            public int dwXpos;
            public int dwYpos;
            public int dwZpos;
            public int dwRpos;
            public int dwUpos;
            public int dwVpos;
            public int dwButtons;
            public int dwButtonNumber;
            public int dwPOV;
            public int dwReserved1;
            public int dwReserved2;
        }

        const int JOY_RETURNBUTTONS = 0x00000080;
        const int JOYERR_NOERROR = 0;

        [DllImport("winmm.dll")]
        static extern int joyGetNumDevs();

        [DllImport("winmm.dll")]
        static extern int joyGetPosEx(int uJoyID, ref JOYINFOEX pji);

        // Orden de botones estándar tal como Windows expone un DualShock 4 /
        // DualSense por HID cuando no hay driver adicional (DS4Windows, etc):
        //   1 Square   2 Cross   3 Circle   4 Triangle
        //   5 L1       6 R1      7 L2(dig)  8 R2(dig)
        //   9 Share    10 Options  11 L3   12 R3
        //   13 PS      14 Touchpad-click
        // (dwButtons es un bitmask: bit0 = botón 1, bit1 = botón 2, ...)
        const int LEGACY_L1 = 1 << 4;   // botón 5
        const int LEGACY_R1 = 1 << 5;   // botón 6
        const int LEGACY_L2 = 1 << 6;   // botón 7
        const int LEGACY_R2 = 1 << 7;   // botón 8
        const int LEGACY_SHARE = 1 << 8;    // botón 9  (≈ Select/Back)
        const int LEGACY_OPTIONS = 1 << 9;  // botón 10 (≈ Start)
        const int LEGACY_L3 = 1 << 10;  // botón 11
        const int LEGACY_R3 = 1 << 11;  // botón 12

        static void Main(string[] args) {
            var stdout = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
            Console.SetOut(stdout);

            // Default combo: Back (0x0020) + Start (0x0010) = 0x0030 (48)
            ushort xinputTargetMask = 0x0030;
            bool xinputCheckTriggersWithStart = false; // L2 + R2 + Start

            int legacyTargetMask = LEGACY_SHARE | LEGACY_OPTIONS;
            bool legacyCheckTriggersWithStart = false;

            if (args != null && args.Length > 0) {
                string arg = args[0].Trim();
                if (arg.Equals("L3_R3", StringComparison.OrdinalIgnoreCase)) {
                    xinputTargetMask = 0x0040 | 0x0080; // LeftThumb (L3) + RightThumb (R3)
                    legacyTargetMask = LEGACY_L3 | LEGACY_R3;
                } else if (arg.Equals("L1_R1", StringComparison.OrdinalIgnoreCase)) {
                    xinputTargetMask = 0x0100 | 0x0200; // LeftShoulder (L1) + RightShoulder (R1)
                    legacyTargetMask = LEGACY_L1 | LEGACY_R1;
                } else if (arg.Equals("L2_R2_START", StringComparison.OrdinalIgnoreCase)) {
                    xinputCheckTriggersWithStart = true;
                    legacyCheckTriggersWithStart = true;
                    legacyTargetMask = LEGACY_L2 | LEGACY_R2 | LEGACY_OPTIONS;
                } else if (arg.Equals("SELECT_START", StringComparison.OrdinalIgnoreCase)) {
                    xinputTargetMask = 0x0030;
                    legacyTargetMask = LEGACY_SHARE | LEGACY_OPTIONS;
                } else if (arg.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) {
                    ushort hexVal;
                    if (ushort.TryParse(arg.Substring(2), System.Globalization.NumberStyles.HexNumber, null, out hexVal)) {
                        xinputTargetMask = hexVal;
                    }
                    // Un mask crudo no tiene equivalente legacy conocido; deshabilitamos
                    // esa rama para el detector de mandos PlayStation en este caso.
                    legacyTargetMask = 0;
                } else {
                    ushort decVal;
                    if (ushort.TryParse(arg, out decVal)) {
                        xinputTargetMask = decVal;
                    }
                    legacyTargetMask = 0;
                }
            }

            bool wasMatch = false;

            while (true) {
                bool anyMatch = false;

                // ── 1) Mandos XInput (Xbox nativo o con emulación XInput) ──
                for (int i = 0; i < 4; i++) {
                    XINPUT_STATE state = new XINPUT_STATE();
                    if (GetXInputState(i, ref state) == 0) {
                        ushort btn = state.Gamepad.wButtons;
                        bool l2 = state.Gamepad.bLeftTrigger > 80;
                        bool r2 = state.Gamepad.bRightTrigger > 80;

                        bool isMatch = false;
                        if (xinputCheckTriggersWithStart) {
                            isMatch = l2 && r2 && ((btn & 0x0010) != 0); // Start + L2 + R2
                        } else if (xinputTargetMask != 0) {
                            isMatch = (btn & xinputTargetMask) == xinputTargetMask;
                        }

                        if (isMatch) {
                            anyMatch = true;
                        }
                    }
                }

                // ── 2) Mandos PlayStation / genéricos vía Legacy Joystick API ──
                if (!anyMatch && legacyTargetMask != 0) {
                    int deviceCount = joyGetNumDevs();
                    for (int j = 0; j < deviceCount; j++) {
                        JOYINFOEX info = new JOYINFOEX();
                        info.dwSize = Marshal.SizeOf(typeof(JOYINFOEX));
                        info.dwFlags = JOY_RETURNBUTTONS;

                        int result;
                        try {
                            result = joyGetPosEx(j, ref info);
                        } catch {
                            continue;
                        }

                        if (result != JOYERR_NOERROR) continue;

                        int btn = info.dwButtons;
                        bool isMatch;
                        if (legacyCheckTriggersWithStart) {
                            isMatch = (btn & (LEGACY_L2 | LEGACY_R2 | LEGACY_OPTIONS)) == (LEGACY_L2 | LEGACY_R2 | LEGACY_OPTIONS);
                        } else {
                            isMatch = (btn & legacyTargetMask) == legacyTargetMask;
                        }

                        if (isMatch) {
                            anyMatch = true;
                            break;
                        }
                    }
                }

                if (anyMatch) {
                    if (!wasMatch) {
                        wasMatch = true;
                        Console.WriteLine("OVERLAY_TRIGGER");
                    }
                } else {
                    wasMatch = false;
                }
                Thread.Sleep(40);
            }
        }
    }
}