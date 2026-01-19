# PowerShell 执行策略问题解决方案

## 问题
运行 `npm` 命令时出现错误：
```
npm : 无法加载文件 C:\nodejs\npm.ps1，因为在此系统上禁止运行脚本
```

## 解决方案

### 方法1：临时解决（仅当前PowerShell会话）
在PowerShell中运行：
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

### 方法2：永久解决（推荐）
1. 右键点击PowerShell，选择"以管理员身份运行"
2. 执行：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
或者运行脚本：
```powershell
powershell -ExecutionPolicy Bypass -File fix-npm-powershell.ps1
```

### 方法3：使用批处理文件（最简单）
直接运行：
```cmd
start-dev.bat
```

### 方法4：使用CMD而不是PowerShell
在CMD中运行npm命令，CMD不受执行策略限制。

## 验证
设置完成后，重启终端，然后运行：
```powershell
npm --version
```

如果显示版本号，说明问题已解决。
