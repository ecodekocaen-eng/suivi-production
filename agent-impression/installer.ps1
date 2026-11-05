# ─────────────────────────────────────────────────────────────
#  Installe (ou met à jour) l'agent d'impression sur le PC atelier :
#  copie le programme dans un dossier fixe, puis crée la tâche Windows
#  qui le lance à l'ouverture de session, sans fenêtre.
#  config.json (qui contient le jeton) n'est jamais écrasé ni copié.
#
#  Usage : powershell -ExecutionPolicy Bypass -File installer.ps1 [-SansDemarrer]
# ─────────────────────────────────────────────────────────────
param([switch]$SansDemarrer)

$ErrorActionPreference = 'Stop'
$nomTache = 'Ecodeko Agent Impression'
# Pas dans AppData : lancé depuis l'application Claude, ce dossier serait redirigé
# vers l'espace privé de l'application, invisible pour le Planificateur de tâches.
$dossier = Join-Path $env:USERPROFILE 'Ecodeko\agent-impression'
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path $node)) { throw "Node.js introuvable : $node" }

# Mise à jour : on arrête l'agent en place avant de remplacer ses fichiers.
$tache = Get-ScheduledTask -TaskName $nomTache -ErrorAction SilentlyContinue
if ($tache) { Stop-ScheduledTask -TaskName $nomTache }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*$dossier\agent.js*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

New-Item -ItemType Directory -Force $dossier | Out-Null
foreach ($f in 'agent.js', 'depot.js', 'edgeprint.js', 'rangees.js', 'package.json', 'config.exemple.json', 'README.md') {
  Copy-Item (Join-Path $PSScriptRoot $f) $dossier -Force
}
New-Item -ItemType Directory -Force (Join-Path $dossier 'vendor') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'vendor\*') (Join-Path $dossier 'vendor') -Force

# Lanceur sans fenêtre : la tâche suit l'agent et le relance s'il s'arrête.
$commande = '"{0}" --no-warnings "{1}"' -f $node, (Join-Path $dossier 'agent.js')
$vbs = @(
  "' Lance l'agent d'impression sans fenetre."
  ('WScript.Quit CreateObject("WScript.Shell").Run("{0}", 0, True)' -f $commande.Replace('"', '""'))
) -join "`r`n"
[IO.File]::WriteAllText((Join-Path $dossier 'lancer.vbs'), $vbs, [Text.Encoding]::ASCII)

$compte = "$env:USERDOMAIN\$env:USERNAME"
Register-ScheduledTask -TaskName $nomTache -Force `
  -Description "Agent d'impression Eco'deko : relie la file d'impression de l'outil de suivi a Edge Print." `
  -Action (New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$dossier\lancer.vbs`"" -WorkingDirectory $dossier) `
  -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $compte) `
  -Principal (New-ScheduledTaskPrincipal -UserId $compte -LogonType Interactive -RunLevel Limited) `
  -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)) | Out-Null

"Agent installé dans $dossier (tâche « $nomTache »)."
if (-not (Test-Path (Join-Path $dossier 'config.json'))) {
  "Il manque config.json : copiez config.exemple.json et remplissez-le, puis relancez ce script."
} elseif ($SansDemarrer) {
  'Agent non démarré (-SansDemarrer).'
} else {
  Start-ScheduledTask -TaskName $nomTache
  'Agent démarré.'
}
