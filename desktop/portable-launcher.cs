using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("AI OS")]
[assembly: AssemblyDescription("AI OS portable desktop launcher")]
[assembly: AssemblyCompany("AI OS")]
[assembly: AssemblyProduct("AI OS")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class PortableLauncher
{
    private static readonly Regex VersionName = new Regex(@"^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$", RegexOptions.CultureInvariant);

    [STAThread]
    private static int Main(string[] args)
    {
        string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        try
        {
            string manifestPath = SafePath(root, "ai-os-portable.json");
            var manifest = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(manifestPath, Encoding.UTF8));
            if (Text(manifest, "product") != "AI OS" || Text(manifest, "format") != "1" || Text(manifest, "portable") != "True" ||
                Text(manifest, "dataDirectory") != "data" || Text(manifest, "versionsDirectory") != ".ai-runtime/versions" ||
                Text(manifest, "activePointer") != ".ai-runtime/.active-runtime")
                throw new InvalidDataException("Invalid AI OS portable manifest.");

            string declaredRuntime = Text(manifest, "runtimeDirectory");
            const string prefix = ".ai-runtime/versions/";
            if (!declaredRuntime.StartsWith(prefix, StringComparison.Ordinal) || !ValidVersion(declaredRuntime.Substring(prefix.Length)))
                throw new InvalidDataException("The runtime directory must name a version inside .ai-runtime/versions.");
            SafePath(root, declaredRuntime);
            // An interrupted install is recovered by the previous runtime's helper before any UI opens.
            string installPath = SafePath(root, ".ai-runtime/updates/install.json");
            if (File.Exists(installPath))
            {
                var pending = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(installPath, Encoding.UTF8));
                string previous = Text(pending, "previous");
                if (!ValidVersion(previous)) throw new InvalidDataException("Invalid recovery runtime.");
                string helperNode = SafePath(root, prefix + previous + "/resources/runtime/node.exe");
                string helperScript = SafePath(root, prefix + previous + "/resources/app/desktop/update-helper.js");
                var recovery = new ProcessStartInfo(helperNode, QuoteArgument(helperScript) + " " + QuoteArgument(root));
                recovery.UseShellExecute = false; recovery.CreateNoWindow = true; recovery.WorkingDirectory = root;
                recovery.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
                using (Process helper = Process.Start(recovery)) { if (helper == null) throw new InvalidOperationException("Cannot recover interrupted update."); }
                return 0;
            }
            string version = File.ReadAllText(SafePath(root, ".ai-runtime/.active-runtime"), Encoding.UTF8).Trim();
            if (!ValidVersion(version)) throw new InvalidDataException("Invalid active runtime version.");
            string executable = SafePath(root, prefix + version + "/AI OS Runtime.exe");
            if (!File.Exists(executable)) throw new FileNotFoundException("AI OS runtime is missing. Extract the complete portable archive.", executable);

            var commandLine = new StringBuilder();
            foreach (string argument in args)
            {
                if (commandLine.Length > 0) commandLine.Append(' ');
                commandLine.Append(QuoteArgument(argument));
            }
            var start = new ProcessStartInfo(executable, commandLine.ToString());
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WorkingDirectory = root;
            start.EnvironmentVariables["AI_OS_PORTABLE_ROOT"] = root;
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            using (Process child = Process.Start(start))
            {
                if (child == null) throw new InvalidOperationException("AI OS could not start its desktop runtime.");
            }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show("AI OS could not start.\n\n" + error.Message, "AI OS", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string Text(Dictionary<string, object> manifest, string key)
    {
        object value;
        return manifest != null && manifest.TryGetValue(key, out value) ? Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) : "";
    }

    private static bool ValidVersion(string version)
    {
        return VersionName.IsMatch(version) && version != "." && version != ".." && !version.EndsWith(".", StringComparison.Ordinal);
    }

    private static string SafePath(string root, string relative)
    {
        if (String.IsNullOrWhiteSpace(relative) || Path.IsPathRooted(relative) || relative.IndexOf(':') >= 0)
            throw new InvalidDataException("An AI OS runtime path is not relative.");
        string[] segments = relative.Replace('\\', '/').Split('/');
        string current = Path.GetFullPath(root);
        string boundary = current.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        foreach (string segment in segments)
        {
            if (segment == "." || segment == ".." || segment.Length == 0 || segment.EndsWith(".", StringComparison.Ordinal) || segment.EndsWith(" ", StringComparison.Ordinal))
                throw new InvalidDataException("An AI OS runtime path escapes its portable folder.");
            current = Path.GetFullPath(Path.Combine(current, segment));
            if (!current.StartsWith(boundary, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("An AI OS runtime path escapes its portable folder.");
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidDataException("An AI OS runtime path must not contain symbolic links or junctions.");
        }
        return current;
    }

    // Windows CommandLineToArgvW rules: double backslashes only before a quote or the closing quote.
    private static string QuoteArgument(string argument)
    {
        var quoted = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char character in argument)
        {
            if (character == '\\') { backslashes++; continue; }
            if (character == '"')
            {
                quoted.Append('\\', backslashes * 2 + 1);
                quoted.Append('"');
            }
            else
            {
                quoted.Append('\\', backslashes);
                quoted.Append(character);
            }
            backslashes = 0;
        }
        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }
}
