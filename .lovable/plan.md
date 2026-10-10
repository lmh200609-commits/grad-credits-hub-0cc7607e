# 按 12 步文档执行，但保留全部数据——逐步去留对照

前提：同一台服务器，只是 IP 从 172.20.10.10 变成 10.18.0.162。老师、学生、申请记录、AI 模型密钥全部保留，**不清库**。

## 12 步逐条对照

| 文档步骤 | 去留 | 说明 |
|---|---|---|
| 1 重置阿里云密码 | 跳过 | 学校服务器，用不到 |
| 2 安装基础命令 / node / nginx | 跳过 | 1Panel 已自带 OpenResty，再装 nginx 会抢 80 端口，网站直接打不开 |
| 3 安装 1Panel | 跳过 | 已装好 |
| 4 开防火墙 | 跳过 | 已在用 |
| 5 下载 Supabase | 跳过 | 服务器上已有整套 Supabase |
| 6 配置 Supabase | **只做一小部分** | 不重新配置，只改 `/root/supabase-project/.env` 里 3 个地址为 `http://10.18.0.162`（API_EXTERNAL_URL、SITE_URL、SUPABASE_PUBLIC_URL） |
| 7 启动 Supabase | **只做一小部分** | 不重新启动整套，改完地址后终端执行 `cd /root/supabase-project && docker compose up -d` 让新地址生效 |
| 8 验证 Supabase | 可选 | 浏览器打开 `http://10.18.0.162/supabase` 能进就行 |
| 9 本地装 Supabase CLI / Docker | 跳过 | 不需要从云端导出 |
| 10 从云端导出文件 | 跳过 | 不需要 |
| 11 导入数据库 | **换成补丁脚本** | 不跑 init.sql（那会清掉所有老师学生和 AI 配置）。改为跑 `update-2026-10.sql` 补丁：1Panel 上传到 /root/ 后终端执行 `docker exec -i supabase-db psql -U postgres < /root/update-2026-10.sql`，只补新表新功能，不动现有数据 |
| 12 构建前端 + 配 nginx | **只做文件覆盖** | 不配 nginx。网页包已按 10.18.0.162 打好，直接覆盖网站目录 |

## 文档没写但必须做的 1 步

- **更新后台功能**：`/root/supabase-project/volumes/functions/` 里删掉旧函数文件夹（保留 main），上传 functions.zip 右键解压覆盖，然后容器页重启 `supabase-edge-functions`。改密码、自动核对、材料导出都靠它。

## 最终执行顺序（5 个动作）

1. 改 .env 的 3 个地址 → `docker compose up -d`（对应文档 6、7 步的精简版）
2. 跑 update-2026-10.sql 补丁（替代文档 11 步，不清库）
3. 覆盖 functions 并重启 supabase-edge-functions（文档漏写的）
4. 上传 website.zip 到 /opt/1panel/www/sites/localhost/index/ 右键解压覆盖，确认 index.html 在最外层（对应文档 12 步的精简版）
5. 按 openresty-config.txt 核对网站配置 → 浏览器 `http://10.18.0.162` Ctrl+F5 → 用原账号登录验证

## 需要的文件（已在文件区「迁移包-10.18.0.162」分组里）

- 迁移操作步骤.txt
- update-2026-10.sql（第 2 动作用，需补进分组）
- functions.zip（第 3 动作用）
- website.zip（第 4 动作用）
- openresty-config.txt（第 5 动作用）

## 验证标准

- 原老师、学生账号能登录，申请记录都在
- 右上角有「修改密码」，管理员端有「赛事名录」「证书名录」
- AI 模型页面里原有密钥配置还在，不用重填
