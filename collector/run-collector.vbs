' run-collector.vbs
' Hidden launcher for the Cost of Code collector.
'
' Usage:
'   wscript.exe run-collector.vbs "<path-to-node.exe>" "<path-to-collector.js>"
'
' wscript.exe itself has no console; WScript.Shell.Run with intWindowStyle=0
' starts node.exe without a console window. We return immediately so the
' Scheduled Task action completes; node continues running detached.

Option Explicit

Dim args, nodeExe, scriptPath, cmd, sh
Set args = WScript.Arguments
If args.Count < 2 Then
  WScript.Quit 2
End If

nodeExe = args(0)
scriptPath = args(1)
cmd = """" & nodeExe & """ """ & scriptPath & """"

Set sh = CreateObject("WScript.Shell")
' 0 = SW_HIDE, False = do not wait for the launched process to exit.
sh.Run cmd, 0, False
