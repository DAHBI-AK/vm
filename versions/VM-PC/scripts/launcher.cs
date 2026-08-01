using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace VM {
  internal static class Launcher {
    [STAThread]
    private static void Main() {
      string dir = GetAppDirectory();

      try {
        if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) {
          ShowError("Cannot find application folder.");
          return;
        }

        string electron = Path.Combine(dir, "node_modules", "electron", "dist", "electron.exe");
        string bat = Path.Combine(dir, "VM.bat");

        if (File.Exists(electron)) {
          StartElectron(electron, dir);
          return;
        }

        if (File.Exists(bat)) {
          RunBatch(bat, dir, false);
          return;
        }

        ShowError("Electron binary not found in:\n" + electron);
      } catch (Exception ex) {
        ShowError(ex.Message);
      }
    }

    private static string GetAppDirectory() {
      string location = Assembly.GetExecutingAssembly().Location;
      if (!string.IsNullOrEmpty(location)) {
        return Path.GetDirectoryName(location);
      }

      return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    }

    private static void StartElectron(string electronPath, string workingDir) {
      Process.Start(new ProcessStartInfo {
        FileName = electronPath,
        Arguments = ".",
        WorkingDirectory = workingDir,
        UseShellExecute = true
      });
    }

    private static void RunBatch(string batPath, string workingDir, bool hidden) {
      Process.Start(new ProcessStartInfo {
        FileName = "cmd.exe",
        Arguments = "/c \"" + batPath + "\"",
        WorkingDirectory = workingDir,
        UseShellExecute = true,
        WindowStyle = hidden ? ProcessWindowStyle.Hidden : ProcessWindowStyle.Normal
      });
    }

    private static void ShowError(string message) {
      MessageBox.Show(
        message,
        "VM",
        MessageBoxButtons.OK,
        MessageBoxIcon.Error
      );
    }
  }
}
