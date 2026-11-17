$ErrorActionPreference = "Continue"
$sv = "d:\project\fitbest\fitbest-server"
$results = [System.Collections.ArrayList]::new()

# Docker 引擎保活：本机 Docker Desktop 在无 docker 命令期间会休眠并杀容器（已实测复现），
# 冒烟全程每 5 秒执行一次 docker ps 维持引擎唤醒
$keepAlive = Start-Job -ScriptBlock { while ($true) { docker ps *> $null; Start-Sleep 5 } }

# 0. 清理旧进程与容器
Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
docker rm -f fitbest-smoke-pg fitbest-smoke-redis 2>$null | Out-Null
docker run -d --name fitbest-smoke-pg -e POSTGRES_USER=fitbest -e POSTGRES_PASSWORD=fitbest -e POSTGRES_DB=fitbest -p 15432:5432 postgres:16-alpine 2>$null | Out-Null
docker run -d --name fitbest-smoke-redis -p 16379:6379 docker.m.daocloud.io/library/redis:7-alpine 2>$null | Out-Null
function Wait-Container($name, $check, $retries) {
    foreach ($i in 1..$retries) {
        $status = (docker ps --filter "name=$name" --format "{{.Status}}" 2>$null)
        if ($status -notmatch "Up") { docker start $name 2>$null | Out-Null; Start-Sleep 2 }
        Invoke-Expression $check 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return $true }
        Start-Sleep 1
    }
    return $false
}
$pgReady = Wait-Container "fitbest-smoke-pg" "docker exec fitbest-smoke-pg pg_isready -U fitbest -d fitbest" 30
$rdReady = Wait-Container "fitbest-smoke-redis" "docker exec fitbest-smoke-redis redis-cli ping" 30
$results.Add("postgres-ready: $pgReady")
$results.Add("redis-ready: $rdReady")

# 1. 静态站 fixtures（冒烟专用）
$web = "$env:TEMP\fitbest-web-smoke"
New-Item -ItemType Directory -Force "$web" | Out-Null
foreach ($site in @("fitbest", "fitbest-hd", "fit-best", "hyrox", "btwe", "fitbestwebsite", "console")) {
    New-Item -ItemType Directory -Force "$web\$site\assets" | Out-Null
    Set-Content -Path "$web\$site\index.html" -Value "<html>$site v1</html>"
    Set-Content -Path "$web\$site\assets\app.abc123.js" -Value "console.log('$site')"
}

# 2. 启动服务
$env:JDBC_DATABASE_URL = "jdbc:postgresql://localhost:15432/fitbest?stringtype=unspecified"
$env:DB_USERNAME = "fitbest"; $env:DB_PASSWORD = "fitbest"
$env:REDIS_URL = "redis://localhost:16379"
$env:FITBEST_WEB_ROOT = "$env:TEMP\fitbest-web-smoke"
$env:JWT_ACCESS_SECRET = "smoke-access-secret"; $env:JWT_REFRESH_SECRET = "smoke-refresh-secret"; $env:JWT_ADMIN_SECRET = "smoke-admin-secret"
$env:AUTH_DEV_RETURN_CODE = "true"; $env:QR_SIGN_SECRET = "smoke-qr-secret"
$env:PUBLIC_BASE_URL = "http://localhost:8080"
$p = Start-Process -FilePath "java" -ArgumentList "-jar", "$sv\target\fitbest-server-0.1.0.jar" -WorkingDirectory $sv -RedirectStandardOutput "$sv\smoke-out.log" -RedirectStandardError "$sv\smoke-err.log" -PassThru -WindowStyle Hidden
$up = $false
foreach ($i in 1..60) { Start-Sleep 1; try { $h = Invoke-RestMethod "http://localhost:8080/actuator/health" -TimeoutSec 2; if ($h.status -eq "UP") { $up = $true; break } } catch {} }
$results.Add("server-up: $up")
if (-not $up) { Get-Content "$sv\smoke-out.log" -Tail 30; Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; $results; exit 1 }

# 2b. 种子数据（应用启动后 Flyway 已建表，此时插入）
$ORG = "11111111-1111-1111-1111-111111111111"
$GYM = "22222222-2222-2222-2222-222222222222"
$MODEL = "33333333-3333-3333-3333-333333333333"
$MACHINE = "44444444-4444-4444-4444-444444444444"
$ADMIN = "55555555-5555-5555-5555-555555555555"
# Admin@123 的 bcrypt 哈希（由 spring-security-crypto BCrypt.hashpw 生成，冒烟固定值）
$adminHash = '$2a$10$1N0JfmIdkrUKdzHZAvSOCO8gpm2r6sj8GNbCuxNIUTua/AvwgfltO'
$sql = @"
INSERT INTO orgs (id, name, code, status, created_at) VALUES ('$ORG', 'FITBEST', 'FITBEST', 'active', now());
INSERT INTO gyms (id, org_id, name, code, timezone, status, created_at) VALUES ('$GYM', '$ORG', 'Smoke Gym', 'SMOKE-1', 'Asia/Shanghai', 'active', now());
INSERT INTO machine_models (id, org_id, type, model, brand, created_at) VALUES ('$MODEL', '$ORG', 'treadmill', 'Treadmill S1', 'FITBEST', now());
INSERT INTO machines (id, model_id, org_id, gym_id, serial_no, status, created_at) VALUES ('$MACHINE', '$MODEL', '$ORG', '$GYM', 'FB-SMOKE-001', 'active', now());
INSERT INTO admin_users (id, org_id, name, phone, password_hash, role, status, created_at) VALUES ('$ADMIN', '$ORG', 'smoke-admin', '13800000000', '$adminHash', 'super', 'active', now());
"@
$sqlFile = "$env:TEMP\fitbest-seed.sql"
Set-Content -Path $sqlFile -Value $sql -Encoding ASCII
Push-Location $env:TEMP
try { docker cp fitbest-seed.sql fitbest-smoke-pg:/tmp/seed.sql 2>$null | Out-Null } finally { Pop-Location }
docker exec fitbest-smoke-pg psql -U fitbest -d fitbest -q -f /tmp/seed.sql 2>$null
$seedCount = (docker exec fitbest-smoke-pg psql -U fitbest -d fitbest -t -c "SELECT count(*) FROM machines" 2>$null)
$results.Add("seed-machines: $(if ($seedCount) { $seedCount.Trim() } else { 'FAIL' })")

# 3. Node 签发的 token 在 Java 端可用（灰度互验；Node 用 crypto 复现 jsonwebtoken 的 HS256 格式）
$nodeSign = @'
const crypto = require('crypto');
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const h = b64({alg:'HS256',typ:'JWT'});
const now = Math.floor(Date.now()/1000);
const p = b64({sub:'99999999-9999-9999-9999-999999999999',typ:'access',iat:now,exp:now+900});
const sig = crypto.createHmac('sha256','smoke-access-secret').update(h+'.'+p).digest('base64url');
console.log(h+'.'+p+'.'+sig);
'@
$nodeToken = ($nodeSign | node - 2>$null | Select-Object -First 1)
$results.Add("node-token-generated: $(if ($nodeToken) { "OK(len=$($nodeToken.Length))" } else { 'FAIL' })")
try { Invoke-RestMethod "http://localhost:8080/api/v1/me" -Headers @{Authorization="Bearer $nodeToken"} -TimeoutSec 5 | Out-Null; $results.Add("jwt-node-to-java: FAIL(200?)") } catch { $code = $_.Exception.Response.StatusCode.value__; $errBody = ""; try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $errBody = $sr.ReadToEnd() } catch {}; if ($errBody -match '账号不存在') { $results.Add("jwt-node-to-java: PASS(404=账号不存在与NestJS一致,签名已通过)") } else { $results.Add("jwt-node-to-java: FAIL($code $errBody)") } }

# 4. 认证链路
$send = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/auth/sms/send" -ContentType "application/json" -Body '{"phone":"13900001111","scene":"login"}' -TimeoutSec 5
$devCode = $send.devCode
$results.Add("sms-send-devcode: $(if ($devCode) {'PASS'} else {'FAIL'})")
$login = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/auth/sms/login" -ContentType "application/json" -Body ('{"phone":"13900001111","code":"' + $devCode + '","device":"smoke"}') -TimeoutSec 5
$loginOk = $login.accessToken -and $login.user.id -and $login.user.identities.phone -like "139****1111" -and ($login.user.goals.weeklySessions -eq 0)
$results.Add("sms-login-profile: $(if ($loginOk) {'PASS'} else {'FAIL'})")
$me = Invoke-RestMethod "http://localhost:8080/api/v1/me" -Headers @{Authorization="Bearer $($login.accessToken)"} -TimeoutSec 5
$results.Add("me-endpoint: $(if ($me.id) {'PASS'} else {'FAIL'})")
Start-Sleep 1
$refresh = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/auth/refresh" -ContentType "application/json" -Body ('{"refreshToken":"' + $login.refreshToken + '"}') -TimeoutSec 5
$results.Add("refresh-rotation: $(if ($refresh.accessToken -and $refresh.refreshToken -ne $login.refreshToken) {'PASS'} else {'FAIL'})")

# 5. Java 签发的 token 在 Node 端可验（互验闭环：HS256 + base64url 与 jsonwebtoken 格式一致）
$nodeVerify = ($refresh.accessToken | node -e "const crypto=require('crypto');let t='';process.stdin.on('data',d=>t+=d).on('end',()=>{const [h,p,s]=t.trim().split('.');const e=crypto.createHmac('sha256','smoke-access-secret').update(h+'.'+p).digest('base64url');console.log(e===s?'OK':'FAIL')})" 2>$null | Select-Object -First 1)
$results.Add("jwt-java-to-node: $nodeVerify")

# 6. 训练会话（幂等）
$sessBody = '{"machineId":"' + $MACHINE + '","machineType":"treadmill","durationSec":1800,"distanceM":5000,"calories":300,"avgHr":150}'
$s1 = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/sessions" -Headers @{Authorization="Bearer $($refresh.accessToken)"; "Idempotency-Key"="smoke-key-1"} -ContentType "application/json" -Body $sessBody -TimeoutSec 5
$s2 = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/sessions" -Headers @{Authorization="Bearer $($refresh.accessToken)"; "Idempotency-Key"="smoke-key-1"} -ContentType "application/json" -Body $sessBody -TimeoutSec 5
$results.Add("session-idempotent: $(if ($s1.id -eq $s2.id -and $s1.gymId -eq $GYM -and $s1.machineModel -eq 'Treadmill S1') {'PASS'} else {'FAIL'})")
$list = Invoke-RestMethod "http://localhost:8080/api/v1/sessions?range=all" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -TimeoutSec 5
$results.Add("session-list: $(if ($list.items.Count -ge 1 -and $list.items[0].startedAt -match 'Z$') {'PASS'} else {'FAIL'})")
$stats = Invoke-RestMethod "http://localhost:8080/api/v1/stats/weekly" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -TimeoutSec 5
$results.Add("stats-weekly: $(if ($stats.totals.sessions -ge 1 -and $stats.daily.Count -eq 7) {'PASS'} else {'FAIL'})")

# 7. 训练记录 + 设备同步
$tr = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/me/training-records" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -ContentType "application/json" -Body '{"clientId":"smoke-tr-1","app":"hyrox","completed":true,"totalTimeSec":5400,"distanceM":8000,"moduleTimes":[600,610,620],"runSplits":[350,355]}' -TimeoutSec 5
$results.Add("training-record: $(if ($tr.moduleTimes.Count -eq 3 -and $tr.runSplits[0] -eq 350) {'PASS(JSON列输出数组)'} else {'FAIL'})")
$devBody = '{"clientSessionId":"smoke-ds-1","device":{"serialNo":"BAND-001","kind":"band"},"app":"hyrox","mode":"training","startedAt":"2026-11-16T02:00:00.000Z","durationSec":4800,"distanceM":9000,"avgHr":155,"quality":"ok","closeReason":"finish","segments":[{"seq":0,"type":"start","durationSec":0,"distanceM":0},{"seq":1,"type":"treadmill","durationSec":360,"distanceM":1000},{"seq":2,"type":"station","durationSec":600,"distanceM":0},{"seq":3,"type":"finish","durationSec":1,"distanceM":0}]}'
$ds = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/me/device-sessions" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -ContentType "application/json" -Body $devBody -TimeoutSec 5
$ds2 = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/me/device-sessions" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -ContentType "application/json" -Body $devBody -TimeoutSec 5
$dsOk = $ds.segments.Count -eq 4 -and $ds2.duplicate -eq $true -and $ds.trainingRecordId -and $ds.device.serialNo -eq "BAND-001"
$results.Add("device-sync-idempotent: $(if ($dsOk) {'PASS'} else {'FAIL'})")

# 8. 分享 + /s SSR
$shareErr = ""
try {
    $share = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/share" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -ContentType "application/json" -Body ('{"sessionId":"' + $s1.id + '"}') -TimeoutSec 5
} catch { try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $shareErr = "create:" + $sr.ReadToEnd() } catch { $shareErr = "create:" + $_.Exception.Message } }
$htmlContent = ""
if ($share -and $share.code) {
    try { $htmlContent = (Invoke-WebRequest "http://localhost:8080/s/$($share.code)" -TimeoutSec 5 -UseBasicParsing).Content } catch { $shareErr += " view:" + $_.Exception.Message }
}
$results.Add("share-ssr: $(if ($share -and $share.url -match '/s/' -and $htmlContent -match 'og:title' -and $htmlContent -match '完成了一次') {'PASS'} else {"FAIL($shareErr) code=$(if($share){$share.code}) url=$(if($share){$share.url}) htmlLen=$($htmlContent.Length) htmlHead=$(if($htmlContent){$htmlContent.Substring(0,[Math]::Min(150,$htmlContent.Length))})"})")

# 9. AI 教练（本地规则）—— 中文请求体以 UTF-8 字节发送（PS5.1 字符串体按本地码页编码会破坏中文）
$coachErr = ""
$chatJson = '{"app":"hyrox","messages":[{"role":"user","content":"心率多少正常"}]}'
$planJson = '{"app":"hyrox","goal":"finish","experience":"none","daysPerWeek":3,"sessionMinutes":60,"equipment":["划船机"],"weak":"滑雪机"}'
try { $chat = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/coach/chat" -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($chatJson)) -TimeoutSec 5 } catch { $coachErr += "chat:" + $_.Exception.Message }
try { $plan = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/coach/plan/generate" -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($planJson)) -TimeoutSec 5 } catch { $coachErr += "plan:" + $_.Exception.Message }
try { $ctx = Invoke-RestMethod "http://localhost:8080/api/v1/coach/context" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -TimeoutSec 5 } catch { $coachErr += "ctx:" + $_.Exception.Message }
$coachOk = $chat.source -eq "local" -and $chat.reply -match "心率" -and $plan.engine -eq "deterministic" -and $plan.weeks.Count -ge 4 -and $plan.weeks[0].sessions.Count -eq 3 -and $ctx.digest.recentCount -ge 1
$results.Add("coach-chat-plan-context: $(if ($coachOk) {'PASS'} else {"FAIL($coachErr) src=$(if($chat){$chat.source}) reply=$(if($chat.reply){$chat.reply.Substring(0,[Math]::Min(30,$chat.reply.Length))}) engine=$(if($plan){$plan.engine}) weeks=$(if($plan){$plan.weeks.Count}) wk0sess=$(if($plan -and $plan.weeks){$plan.weeks[0].sessions.Count}) ctxCount=$(if($ctx){$ctx.digest.recentCount})"})")

# 10. 器械 + 扫码（QR HMAC 防伪）
$machinesList = Invoke-RestMethod "http://localhost:8080/api/v1/machines" -TimeoutSec 5
$qrSig = node -e "console.log(require('crypto').createHmac('sha256','smoke-qr-secret').update('$MACHINE').digest('base64url').slice(0,16))" 2>$null
$scan = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/scan/resolve" -ContentType "application/json" -Body ('{"kind":"qr","value":"fb1.' + $MACHINE + '.' + $qrSig + '"}') -TimeoutSec 5
$scanBad = $null
try { $scanBad = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/scan/resolve" -ContentType "application/json" -Body ('{"kind":"qr","value":"fb1.' + $MACHINE + '.wrong000000wrong0"}') -TimeoutSec 5 } catch {}
$results.Add("machines-scan-qr: $(if ($machinesList.Count -ge 1 -and $scan.machine.serialNo -eq 'FB-SMOKE-001' -and -not $scanBad) {'PASS(伪造签名被拒)'} else {'FAIL'})")

# 11. 管理端登录
$adminLogin = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/admin/auth/login" -ContentType "application/json" -Body '{"phone":"13800000000","password":"Admin@123"}' -TimeoutSec 5
$adminToken = $adminLogin.token
$results.Add("admin-login: $(if ($adminToken -and $adminLogin.admin.role -eq 'super') {'PASS'} else {'FAIL'})")

# 11b. 创建赛事（管理端写操作；中文以 UTF-8 字节发送）
$evtJson = '{"title":"冒烟赛事","externalUrl":"https://example.com/hyrox","sort":1}'
$evt = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/admin/event-links" -Headers @{Authorization="Bearer $adminToken"} -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($evtJson)) -TimeoutSec 5
$overview = Invoke-RestMethod "http://localhost:8080/api/v1/admin/overview?app=hyrox" -Headers @{Authorization="Bearer $adminToken"} -TimeoutSec 5
$usersPage = Invoke-RestMethod "http://localhost:8080/api/v1/admin/users?keyword=训练者" -Headers @{Authorization="Bearer $adminToken"} -TimeoutSec 5
$overviewOk = $overview.users -ge 1 -and $overview.activeMachines -ge 1 -and $overview.trainingRecordsTotal -ge 2
$results.Add("admin-overview-users: $(if ($overviewOk) {'PASS'} else {'FAIL'})")
$results.Add("admin-users-search: $(if ($usersPage.total -ge 1) {'PASS'} else {'FAIL'})")

# 13. 管理端写操作 + 审计
$created = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/admin/machines" -Headers @{Authorization="Bearer $adminToken"} -ContentType "application/json" -Body ('{"gymId":"' + $GYM + '","modelId":"' + $MODEL + '","serialNo":"FB-SMOKE-002"}') -TimeoutSec 5
Start-Sleep 1
$audits = Invoke-RestMethod "http://localhost:8080/api/v1/admin/audit-logs" -Headers @{Authorization="Bearer $adminToken"} -TimeoutSec 5
$auditOk = $created.serialNo -eq "FB-SMOKE-002" -and ($audits.items | Where-Object { $_.action -match "POST /api/v1/admin/(machines|event-links)" }).Count -ge 2
$results.Add("admin-write-audit: $(if ($auditOk) {'PASS'} else {'FAIL'})")

# 14. 赛事公开 + 报名
$events = Invoke-RestMethod "http://localhost:8080/api/v1/events" -TimeoutSec 5
$reg = Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/events/$($evt.id)/registration" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -TimeoutSec 5
$myRegs = Invoke-RestMethod "http://localhost:8080/api/v1/me/registrations" -Headers @{Authorization="Bearer $($refresh.accessToken)"} -TimeoutSec 5
$results.Add("events-register: $(if ($events.Count -ge 1 -and $reg.registered -eq $true -and $myRegs.Count -ge 1) {'PASS'} else {'FAIL'})")

# 15. 异常契约
try { Invoke-RestMethod "http://localhost:8080/api/v1/none" -TimeoutSec 5 | Out-Null; $results.Add("api-404: FAIL(200)") } catch { $results.Add("api-404: $(if ([int]$_.Exception.Response.StatusCode -eq 404) {'PASS'} else {'FAIL'})") }
try { Invoke-RestMethod "http://localhost:8080/api/v1/me" -TimeoutSec 5 | Out-Null; $results.Add("unauthorized-401: FAIL(200)") } catch { $results.Add("unauthorized-401: $(if ([int]$_.Exception.Response.StatusCode -eq 401) {'PASS'} else {'FAIL'})") }
try { Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/auth/sms/login" -ContentType "application/json" -Body '{"phone":"123","code":"1"}' -TimeoutSec 5 | Out-Null; $results.Add("validation-400: FAIL") } catch { $results.Add("validation-400: $(if ([int]$_.Exception.Response.StatusCode -eq 400) {'PASS'} else {'FAIL'})") }

# 16. 静态站回归
try { $idx = Invoke-WebRequest "http://localhost:8080/fitbest/" -TimeoutSec 5 -UseBasicParsing; $results.Add("static-site: $(if ($idx.StatusCode -eq 200) {'PASS'} else {'FAIL'})") } catch { $results.Add("static-site: FAIL") }

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Stop-Job $keepAlive -ErrorAction SilentlyContinue
Remove-Job $keepAlive -Force -ErrorAction SilentlyContinue
$results | Where-Object { $_ }
