if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole("Administrators")) { Start-Process powershell.exe "-File `"$PSCommandPath`"" -Verb RunAs; exit }
cd E:\Projects\Obscura
npm run clean
rm -rf dist dist-electron
Remove-Item -Recurse -Force .\release
npm run electron:build