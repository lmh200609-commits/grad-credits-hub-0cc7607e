# 自托管服务器更新指南（2026-10 版）

> 适用：校园局域网自托管部署（1Panel/OpenResty + 自托管 Supabase）。
> 前提：服务器上已按《docs/self-hosted-deployment.md》完成过一次完整部署。
> 本次更新不改动 Nginx/OpenResty 配置、不改桶（bucket）、不重跑 init.sql、不动 AI 密钥。

---

## 本次更新的三样东西

| 序号 | 更新什么 | 为什么 |
|---|---|---|
| 1 | 数据库：补 1 个 SQL 脚本 | 新增赛事/证书名录表、申请表提交流程（全部传完才生成申请）、若干权限收紧 |
| 2 | Edge Functions：整体替换并删掉 4 个已下线函数 | 改密码、图片鉴别、报表等后台逻辑都有更新 |
| 3 | 前端：重新构建并覆盖静态文件 | 界面与流程的大量更新（改密码入口、提交加固、材料导出优化、名录维护页等） |

---

## 第 1 步：更新数据库

用仓库里的 **`supabase/self-hosted/update-2026-10.sql`**（本脚本可重复执行，跑多次也不会出错）。

方式 A（推荐，图形界面）：
1. 浏览器打开自托管 Studio：`http://172.20.10.10/supabase`（输入 Basic Auth 账号密码）。
2. 左侧 **SQL Editor** → New query。
3. 把 `update-2026-10.sql` 的**全部内容**粘贴进去 → **Run**。
4. 显示 `Success. No rows returned` 即成功。

方式 B（命令行）：把该文件上传到服务器后执行：

```bash
docker exec -i supabase-db psql -U postgres < /path/to/update-2026-10.sql
```

脚本内容 = 2026-09 以后的全部 7 条数据库迁移 + 1 条存储策略（学生可清理自己目录下的残留文件）。

---

## 第 2 步：更新 Edge Functions

在**本机**（有这份代码的电脑）执行，把 `supabase/functions/` 整体同步到服务器：

```bash
rsync -av --delete supabase/functions/ root@172.20.10.10:/root/supabase-project/volumes/functions/
```

> `--delete` 会顺带删掉服务器上已下线的函数（dev-seed、ai-eval-stress-test、bootstrap-admin、process-eval-queue）。如果不用 rsync，也可以手动删除这 4 个目录再整体上传。

然后在服务器上重启函数容器并确认日志无报错：

```bash
cd /root/supabase-project
docker compose restart functions
docker compose logs --tail=50 functions
```

抽查一个函数能通（返回 JSON 即可，401 也算通，**不能是 404**）：

```bash
ANON_KEY=$(grep '^ANON_KEY=' .env | cut -d= -f2)
curl -i http://172.20.10.10/supabase/functions/v1/reset-password \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

---

## 第 3 步：重新构建并上传前端

在本机项目根目录：

1. 改 `src/integrations/supabase/client.ts` 开头的两行，换成**和当前线上版本一致**的值（就是上次部署时用的内网地址和 ANON_KEY）：

```ts
const SUPABASE_URL = "http://172.20.10.10/supabase";
const SUPABASE_PUBLISHABLE_KEY = "<服务器 .env 里的 ANON_KEY>";
```

2. 构建并上传（把 dist **内部内容**覆盖到站点根目录，保持结构原样）：

```bash
npm install
npm run build
rsync -av --delete dist/ root@172.20.10.10:/opt/1panel/www/sites/localhost/index/
```

> 上传前建议备份现有站点目录：
> `cp -r /opt/1panel/www/sites/localhost/index /opt/1panel/www/sites/localhost/index.bak-$(date +%m%d)`
> 确认新版正常后可删除备份。
>
> 申请表模板/示例表在 `public/templates/` 里，构建时会自动打进 dist，不需要单独上传。

---

## 第 4 步：验收清单

浏览器访问 `http://172.20.10.10`，逐项确认：

- [ ] 登录页正常，管理员账号能登录；
- [ ] 右上角出现「修改密码」按钮，改密后用新密码能重新登录；
- [ ] 学生账号第一次登录提示完善个人信息；
- [ ] 学生提交申请：申请表 + 多张佐证图片全部上传后才生成申请；中途断网/切页不会留下残缺申请；
- [ ] 管理员端出现「赛事名录」「证书名录」页面，能增删改；
- [ ] 「材料导出」能正常打包下载；
- [ ] 教师审核「通过/驳回」正常。

全部通过后，删除第 3 步做的站点备份。

---

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 登录后一直转圈或报网络错误 | `client.ts` 里的 SUPABASE_URL 或 KEY 与服务器不一致，重新核对后重新构建 |
| 学生提交时报「请至少上传 1 张佐证材料图片」之外的新错误 | 第 1 步的 SQL 没跑或没跑完，重跑一次（脚本可重复执行） |
| 调用后台功能返回 404 | 第 2 步函数没同步成功或没重启 functions 容器 |
| 页面样式错乱、点菜单 404 | 上传时把 dist 外层包了一层目录；确认 index.html 直接位于站点根目录下 |
