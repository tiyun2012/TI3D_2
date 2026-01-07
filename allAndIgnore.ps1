param(
    [Parameter(Mandatory=$true)]
    [string]$Root,                     # Root directory

    [string[]]$IgnoreFolder,           # Folders to skip
    [string]$FileName                  # Output file name
)

# Place output outside Root (in parent folder)
$ParentDir = Split-Path $Root -Parent
$OutputFile = Join-Path $ParentDir $FileName

# Clear or create the output file
if (Test-Path $OutputFile) {
    Clear-Content $OutputFile
} else {
    New-Item -Path $OutputFile -ItemType File | Out-Null
}

# Queue for breadth-first traversal
$queue = New-Object System.Collections.Queue
$queue.Enqueue($Root)

# Track unique files
$uniqueFiles = @{}

while ($queue.Count -gt 0) {
    $currentDir = $queue.Dequeue()

    # Skip if path contains any ignored folder (case-insensitive)
    $skip = $false
    foreach ($ign in $IgnoreFolder) {
        if ($currentDir.ToLower().Contains($ign.ToLower())) {
            $skip = $true
            break
        }
    }
    if ($skip) { continue }

    # Process files in this directory
    $files = Get-ChildItem -Path $currentDir -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        if (-not $uniqueFiles.ContainsKey($file.FullName)) {
            $uniqueFiles[$file.FullName] = $true

            # Write file path
            Add-Content -Path $OutputFile -Value ("// File: " + $file.FullName)

            # Write file content
            Get-Content $file.FullName | Add-Content -Path $OutputFile

            # Separator for readability
            Add-Content -Path $OutputFile -Value "`n----`n"
        }
    }

    # Enqueue child directories
    $dirs = Get-ChildItem -Path $currentDir -Directory -ErrorAction SilentlyContinue
    foreach ($dir in $dirs) {
        $queue.Enqueue($dir.FullName)
    }
}

Write-Host "Traversal complete. Output stored in $OutputFile"

# ./allAndIgnore.ps1 -Root "." -IgnoreFolder @("node_modules", ".git","docs",".env.local") -FileName "toAI_output.txt"