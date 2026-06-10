# Agent Instructions For This Repository

Most of the repo only uses typescript/npm. However, there are a few python scripts (e.g. gen_macros.py) that are used as helpers. If you need to run these, wse the `work` conda environment:

```powershell
$conda = "$env:USERPROFILE\anaconda3\Scripts\conda.exe"
& $conda run -n work <command>
```
