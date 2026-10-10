# 重新迁移到学校服务器（10.18.0.162）——步骤对照与准备文件

## 结论：文档 12 步里，你可以省掉 8 步

| 文档步骤 | 处理 | 原因 |
|---|---|---|
| 1 重置阿里云密码 | 省略 | 你用的是学校服务器，不是阿里云 |
| 2 安装基础命令 / node / nginx | 省略（尤其不要装 nginx） | 1Panel 已自带 OpenResty 占用 80 端口，再装 nginx 会冲突，网站直接打不开 |
| 3 安装 1Panel | 省略 | 已装好 |
| 4 开防火墙 | 省略 | 已在用 |
| 5～8 下载、配置、启动 Supabase | 省略，只改 1 处 | 服务器里已有 Supabase。只需把 .env 里 3 个地址改成 `http://10.18.0.162`，再重启 |
| 9 本地装 Supabase CLI / scoop / Docker Desktop | 省略 | 我直接把建表脚本做好给你，不需要从云端导出 |
| 10 从云端导出三个文件 | 省略 | 同上 |
| 11 导入数据库 | 必须做（换成我给的脚本） | 1Panel 终端一行命令 |
| 12 构建前端 + 配 nginx | 必须做（只传文件，不配 nginx） | 我用新地址 10.18.0.162 打好网页文件，你在 1Panel「文件」里覆盖；网站设置只需确认有一条 `try_files` 和 `/supabase/` 转发 |
| 文档没写：后台功能 | 必须做 | 改密码、自动核对、导出都靠它，文档漏了 |

关于数据：不从云端搬。脚本只建好表、规则和默认赛事/证书名录；学院、管理员账号由脚本里自动建一个超级管理员，其余（学院、老师、学生）登录后在系统里自行导入。

## 你要走的 5 步（全部在 1Panel 面板里完成）

1. 文件 → `/root/supabase-project/.env`，把 `SUPABASE_PUBLIC_URL`、`API_EXTERNAL_URL`、`SITE_URL` 改成 `http://10.18.0.162`，保存；容器 → 重启全部 supabase 容器。
2. 上传 `full-init.sql` 到 `/root/`，终端执行一行导入命令。
3. 上传后台功能文件到 `/root/supabase-project/volumes/functions/`，重启 functions 容器。
4. 上传网页文件到 `/opt/1panel/www/sites/localhost/index/`（按文件夹分组给你，不打压缩包）。
5. 网站 → 配置文件，核对两段设置（我给原文直接粘贴）；浏览器打开 `http://10.18.0.162` 用初始超级管理员登录并改密码。

## 我会准备好的文件

- `迁移操作步骤.txt`：上面 5 步的逐点说明 + 出错对照表
- `full-init.sql`：完整建表脚本（所有表、权限规则、函数、存储桶、默认名录、初始超级管理员），可重复执行，且不清除服务器上已有数据
- 后台功能文件（按功能分组，每组单独文件）
- 网页文件（已写入 10.18.0.162 和你给的 ANON_KEY）
- `openresty-网站配置.txt`：要粘贴的两段设置
- 初始超级管理员账号密码（单独文件，用完删除）

## 技术细节

- 从云端 schema 生成 `pg_dump --schema-only` 等价脚本（public + storage 策略），用 `IF NOT EXISTS`/`CREATE OR REPLACE` 保证可重复执行；附带 catalog/credit_standards 种子数据。
- 前端以 `SUPABASE_URL=http://10.18.0.162/supabase` 构建后恢复 client.ts 云地址。
- 上次白屏原因：构建写的是 172.20.10.10，而实际访问是 10.18.0.162，且 assets 请求被回退为 index.html；新包按正确地址构建，并在说明中要求检查 assets 位置与 `try_files`。
- 初始超管通过 auth.users 插入 + user_roles 赋予 super_admin。
