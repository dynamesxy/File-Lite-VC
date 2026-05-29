from __future__ import annotations

import os
import subprocess


def pick_directory(initial: str | None = None) -> str | None:
    if os.name == "nt":
        script = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$form = New-Object System.Windows.Forms.Form; "
            "$form.TopMost = $true; "
            "$form.StartPosition = 'CenterScreen'; "
            "$form.Width = 0; $form.Height = 0; $form.ShowInTaskbar = $false; "
            "$form.Show(); "
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "if ($args[0] -and $args[0] -ne '') { $d.SelectedPath = $args[0] }; "
            "$r = $d.ShowDialog($form); "
            "$form.Close(); "
            "if ($r -eq 'OK') { Write-Output $d.SelectedPath }"
        )
        r = subprocess.run(
            ["powershell", "-NoProfile", "-STA", "-Command", script, initial or ""],
            capture_output=True,
            text=True,
        )
        p = (r.stdout or "").strip()
        return p or None
    return None
