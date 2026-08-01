Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = appDir & "\VM.bat"

If Not fso.FileExists(batPath) Then
  MsgBox "VM.bat not found.", vbCritical, "VM"
  WScript.Quit 1
End If

shell.CurrentDirectory = appDir
shell.Run Chr(34) & batPath & Chr(34), 0, False
