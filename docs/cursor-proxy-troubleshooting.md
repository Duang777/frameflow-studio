# Cursor 代理排查（Proxy Troubleshooting）

当你看到类似报错：

`Failed to establish a socket connection to proxies: PROXY 127.0.0.1:7897`

通常不是 Cursor 服务故障，而是本机代理链路异常（例如 Clash/V2Ray 端口未监听）。

## 1) 快速判断

- DNS 正常、但 API/Chat/Ping 全失败：优先检查代理配置。
- 报错里出现 `127.0.0.1:7897`：说明正在尝试走本地代理端口。

## 2) 命令行自检

### Windows（PowerShell）

```powershell
# 查看 7897 端口是否有本地进程监听
netstat -ano | findstr 7897

# 查看代理相关环境变量
Get-ChildItem Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY

# 临时清理当前终端代理变量
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:ALL_PROXY -ErrorAction SilentlyContinue
```

### macOS / Linux

```bash
# 查看 7897 端口是否被监听
lsof -i :7897

# 查看代理环境变量
env | grep -Ei 'http_proxy|https_proxy|all_proxy'

# 临时清理当前终端代理变量
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY
```

## 3) 系统代理检查

- 打开系统网络代理设置，确认是否残留 `127.0.0.1:7897`。
- 如果你不打算走代理：关闭 HTTP/HTTPS/SOCKS 代理后重启 Cursor。
- 如果你要走代理：确认代理软件正在运行、端口配置与你的 Cursor 一致。

## 4) 代理软件排查（Clash/V2Ray 等）

- 检查软件是否已启动。
- 检查监听端口是否仍是 `7897`（可能变成 `7890`、`1080` 等）。
- 检查系统代理开关/TUN 模式是否开启。

## 5) 最后步骤

1. 完全退出 Cursor。  
2. 重新打开 Cursor。  
3. 再跑 Network Diagnostics 确认恢复。  

---

## Common Root Causes

1. Proxy app is not running.  
2. Proxy app port changed (not `7897` anymore).  
3. System proxy residue still points to `127.0.0.1:7897`.  
4. `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` environment variables not cleaned.  
