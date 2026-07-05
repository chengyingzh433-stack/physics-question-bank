' 双击启动：隐藏 cmd 窗口，直接弹应用。关掉应用窗口即全部退出。
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c npm run dev", 0, False
