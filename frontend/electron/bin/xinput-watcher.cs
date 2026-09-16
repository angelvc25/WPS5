using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace XInputWatcher {
    class Program {
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

        static int GetState(int userIndex, ref XINPUT_STATE state) {
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

        static void Main(string[] args) {
            var stdout = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
            Console.SetOut(stdout);

            // Default combo: Back (0x0020) + Start (0x0010) = 0x0030 (48)
            ushort targetMask = 0x0030;
            bool checkTriggersWithStart = false; // L2 + R2 + Start

            if (args != null && args.Length > 0) {
                string arg = args[0].Trim();
                if (arg.Equals("L3_R3", StringComparison.OrdinalIgnoreCase)) {
                    targetMask = 0x0040 | 0x0080; // LeftThumb (L3) + RightThumb (R3)
                } else if (arg.Equals("L1_R1", StringComparison.OrdinalIgnoreCase)) {
                    targetMask = 0x0100 | 0x0200; // LeftShoulder (L1) + RightShoulder (R1)
                } else if (arg.Equals("L2_R2_START", StringComparison.OrdinalIgnoreCase)) {
                    checkTriggersWithStart = true;
                } else if (arg.Equals("SELECT_START", StringComparison.OrdinalIgnoreCase)) {
                    targetMask = 0x0030;
                } else if (arg.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) {
                    ushort hexVal;
                    if (ushort.TryParse(arg.Substring(2), System.Globalization.NumberStyles.HexNumber, null, out hexVal)) {
                        targetMask = hexVal;
                    }
                } else {
                    ushort decVal;
                    if (ushort.TryParse(arg, out decVal)) {
                        targetMask = decVal;
                    }
                }
            }

            bool wasMatch = false;

            while (true) {
                bool anyMatch = false;
                for (int i = 0; i < 4; i++) {
                    XINPUT_STATE state = new XINPUT_STATE();
                    if (GetState(i, ref state) == 0) {
                        ushort btn = state.Gamepad.wButtons;
                        bool l2 = state.Gamepad.bLeftTrigger > 80;
                        bool r2 = state.Gamepad.bRightTrigger > 80;

                        bool isMatch = false;
                        if (checkTriggersWithStart) {
                            isMatch = l2 && r2 && ((btn & 0x0010) != 0); // Start + L2 + R2
                        } else if (targetMask != 0) {
                            isMatch = (btn & targetMask) == targetMask;
                        }

                        if (isMatch) {
                            anyMatch = true;
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
