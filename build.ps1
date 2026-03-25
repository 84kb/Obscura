if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole("Administrators")) { Start-Process powershell.exe "-File `"$PSCommandPath`"" -Verb RunAs; exit }
cd E:\Projects\Obscura
Remove-Item -Recurse -Force .\dist-tauri -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\Release -ErrorAction SilentlyContinue
npm run tauri:build

New-Item -ItemType Directory -Path .\Release -Force | Out-Null

# Tauri bundle artifacts (nsis/msi/appimage/etc)
if (Test-Path .\src-tauri\target\release\bundle) {
    Copy-Item .\src-tauri\target\release\bundle\* .\Release -Recurse -Force
}

# Built frontend assets for reference/debugging
if (Test-Path .\dist-tauri) {
    Copy-Item .\dist-tauri .\Release\dist-tauri -Recurse -Force
}
