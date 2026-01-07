Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.md |
  Where-Object { $_.FullName -notmatch "node_modules|dist|build" } |
  Sort-Object FullName |
  ForEach-Object {
    "`n`n===== FILE: $($_.FullName) =====`n"
    Get-Content $_
  } | Set-Content project-bundle.txt
