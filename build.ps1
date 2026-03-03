if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole("Administrators")) { Start-Process powershell.exe "-File `"$PSCommandPath`"" -Verb RunAs; exit }
cd E:\Projects\Obscura
Remove-Item -Recurse -Force .\dist-tauri -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\release -ErrorAction SilentlyContinue
npm run tauri:build
