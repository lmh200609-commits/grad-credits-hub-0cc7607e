# 保留全部数据的更新方案（IP 变为 10.18.0.162）

## 前提
同一台服务器，只是 IP 从 172.20.10.10 变成了 10.18.0.162。数据库里的老师、学生、申请记录、AI 模型密钥全部原样保留，**不清库、不重建**。

## 要做的 4 件事（全部在 1Panel 面板内完成）

### ① 改 Supabase 的地址（1Panel 文件 + 终端）
1. 1Panel → 文件 → 打开 `/root/supabase-project/.env`
2. 把里面所有 `172.20.10.10` 改成 `10.18.0.162`（一般 3 处：API_EXTERNAL_URL、SITE_URL、SUPABASE_PUBLIC_URL）
3. 1Panel → 终端执行：`cd /root/supabase-project && docker compose up -d`（让新地址生效）

### ② 更新后台功能（1Panel 文件 + 容器页）
1. 1Panel → 文件 → 进入 `/root/supabase-project/volumes/functions/`
2. 删除旧文件夹（dev-seed、ai-eval-stress-test、bootstrap-admin、process-eval-queue 如有），保留 `main`
3. 上传迁移包里的 functions 内容覆盖
4. 1Panel → 容器 → 重启 `supabase-edge-functions`

### ③ 更新网页文件（1Panel 文件）
1. 进入 `/opt/1panel/www/sites/localhost/index/`
2. 上传 website.zip，右键解压覆盖（网页文件已按新地址 10.18.0.162 重新打包）

### ④ 核对网站设置 + 验证
1. 按 openresty-config.txt 核对 1Panel 网站配置（try_files 等）
2. 浏览器打开 `http://10.18.0.162`，Ctrl+F5 强刷
3. 用原来的账号登录：老师、学生账号都还在，AI 鉴别配置也还在，不需要重新配

## 不需要做的事
- ❌ 不跑 init.sql（那是清库重建用的，会删掉所有数据）
- ❌ 不用重新建学院、导入老师学生
- ❌ 不用重新配 AI 模型密钥
- ❌ 不用装 nginx、不用重装 Supabase

## 需要你准备的
- 迁移包里的：functions 文件夹、website.zip、openresty-config.txt（我已放在文件区「迁移包-10.18.0.162」分组里，直接用）
- init.sql 和 admin-account.txt 这次**用不上**，忽略即可

## 建议（可选）
更新前在 1Panel 文件里把 `/root/supabase-project/volumes/db/data` 打包备份一份，万一出问题可恢复。
