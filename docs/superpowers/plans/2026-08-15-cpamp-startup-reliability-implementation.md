# CPAMP Startup Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CPAMP start reliably after WSL address changes and provide a double-click launcher that preserves actionable errors.

**Architecture:** A small PowerShell helper waits for a stable WSL address through an injected reader scriptblock. `Start-CPAMP.ps1` calls it after Docker startup, rebuilds Windows forwarding with the final address, validates every boundary, and starts the existing Node LAN relay. A batch launcher invokes the script with execution-policy bypass.

**Tech Stack:** Windows PowerShell 5.1, WSL2, Docker Compose, Node.js TCP relay, `netsh`.

## Global Constraints

- Keep the WSL distribution name `Ubuntu-26.04`.
- Keep the Windows proxy endpoint `127.0.0.1:7890`.
- Keep the LAN endpoint `192.168.1.8:8317`.
- Do not delete Docker volumes or use `docker compose down -v`.

---

### Task 1: Stable WSL address selection

**Files:**
- Create: `CPAMP-Startup.Helpers.ps1`
- Create: `Test-CPAMP-Startup.ps1`
- Modify: `Start-CPAMP.ps1`

**Interfaces:**
- Produces: `Wait-CPAMPStableIPv4 -ReadAddress <scriptblock> -RequiredMatches <int> -MaxAttempts <int> -DelayMilliseconds <int>` returning a stable IPv4 string.
- Consumes: a scriptblock that returns the current WSL IPv4 string.

- [ ] **Step 1: Write the failing test**

Create a test that supplies `172.18.112.203`, then `172.18.164.3` twice, and asserts that the helper returns `172.18.164.3`. Also assert that `Start-CPAMP.ps1` refreshes the stable address after `docker compose up -d`.

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Test-CPAMP-Startup.ps1`

Expected: non-zero exit because `CPAMP-Startup.Helpers.ps1` and the post-Docker stable refresh do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement the bounded consecutive-match loop in `CPAMP-Startup.Helpers.ps1`, dot-source it from `Start-CPAMP.ps1`, and call it after Docker Compose reports success.

- [ ] **Step 4: Run test to verify it passes**

Run the same PowerShell command and expect `PASS` with exit code `0`.

### Task 2: Reliable forwarding, relay, and launcher

**Files:**
- Modify: `Start-CPAMP.ps1`
- Create: `启动CPAMP.bat`
- Modify: `Test-CPAMP-Startup.ps1`
- Modify: `CPAMP启动与使用说明.md`

**Interfaces:**
- `Start-CPAMP.ps1` rebuilds `127.0.0.1:18317` against the current stable WSL IP.
- `启动CPAMP.bat` invokes `Start-CPAMP.ps1` using Windows PowerShell with `-ExecutionPolicy Bypass`.

- [ ] **Step 1: Extend the failing test**

Assert that the launcher exists, uses `%~dp0`, and invokes PowerShell with `-ExecutionPolicy Bypass`. Assert that the startup script verifies the WSL endpoint before Windows forwarding and checks the relay process after launch.

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Test-CPAMP-Startup.ps1`

Expected: non-zero exit because the launcher and validation markers are absent.

- [ ] **Step 3: Implement forwarding and launcher**

Rebuild the forwarding rule only after direct WSL HTTP `200`, retry if the IP changes, clean stale relay PID state, verify the new Node process, and add the batch launcher plus updated documentation.

- [ ] **Step 4: Run automated and live verification**

Run the PowerShell test, then execute `启动CPAMP.bat` as administrator. Verify HTTP `200` from the manager and HTTP `401` from both local and LAN `/v1/models` without an API key.
