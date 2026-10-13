# 部署说明第 4 版：把第 7、8 步写成"小白照抄版"

## 检查文档发现的问题（第 3 版里）
1. 表格写"打开核对一下就行"，但下面正文写的是"修改以下几项"，两处说法不一致，容易让人不知道该改还是该看。
2. 第 7 步里写"AI_KEY_ENCRYPTION_SECRET=与旧系统相同的值"，和第 2 版结论（云端没存过 AI 模型密钥，填一个固定值即可）矛盾。
3. 没告诉你"怎么判断已经有了"：要找哪几个字、长什么样算对、长什么样算错。
4. 没提醒 .env 里地址要从旧 IP 改成新 IP（10.18.0.162），老地址留着会登录不上。
5. 第 8 步的 docker-compose.yml 没说"缩进"具体长什么样，小白很容易对不齐导致启动失败；也没说改错了怎么恢复。
6. 第 8 步结尾的"启动"命令与后面"清空旧数据库"会重复执行，顺序要理顺：第 7、8 步只改文件、先不启动，等清空数据库那一步一起启动。

## 第 7 步改写为（每一小步都带截图式说明）
1. 1Panel 左侧点「文件」→ 地址栏粘贴 `/root/supabase-project` 回车 → 找到 `.env`（看不到就点右上角"显示隐藏文件"）→ 先右键「复制」备份一份叫 `.env.bak`。
2. 双击 `.env` 打开 → 按 Ctrl+F 依次搜下面每个词，对照表格看"对的样子"，不对就改成表格里那一行（整行替换）：

| 搜索这个词 | 正确的样子 |
|---|---|
| SUPABASE_PUBLIC_URL | `SUPABASE_PUBLIC_URL=http://10.18.0.162/supabase` |
| API_EXTERNAL_URL | `API_EXTERNAL_URL=http://10.18.0.162/supabase` |
| SITE_URL | `SITE_URL=http://10.18.0.162` |
| ENABLE_EMAIL_AUTOCONFIRM | `ENABLE_EMAIL_AUTOCONFIRM=true` |
| ANON_KEY | 等号后面有一长串 eyJ 开头的字，有就别动 |
| SERVICE_ROLE_KEY | 同上，有就别动 |

3. 再搜 7 个 AI 密钥：DASHSCOPE_API_KEY、DEEPSEEK_API_KEY、AI_KEY_ENCRYPTION_SECRET、ALIYUN_AK_ID、ALIYUN_AK_SECRET、ALIYUN_GREEN_REGION、ALIYUN_AIGC_SERVICE。
   - 搜得到且等号后面有内容 → 不用动。
   - 搜不到 → 把文档给的整段粘到文件最后一行下面，再把"你的值"换成真实密钥（附：每个密钥去哪个网站哪个页面复制）。
   - AI_KEY_ENCRYPTION_SECRET 已有就别动；没有就填文档给的示例固定字符串，以后不要改。
4. 点「保存」。

## 第 8 步改写为
1. 同一个文件夹双击 `docker-compose.yml`，先备份为 `docker-compose.yml.bak`。
2. Ctrl+F 搜 `DASHSCOPE_API_KEY`：搜得到 7 行都在 → 直接关掉，不用改。
3. 搜不到：Ctrl+F 搜 `functions:` → 往下找 `environment:` → 找到它下面最后一行（形如 `      VERIFY_JWT: ...`）→ 光标点在这行末尾回车 → 粘贴文档给的 7 行。
4. 用一张"对齐示意图"说明：新加的每行前面的空格数和上一行完全一样（用空格，不用 Tab）；附正确和错误的对比例子。
5. 保存。此处先不启动，启动放到"清空旧数据库"第 3 小步一起做。
6. 出错怎么办：启动时出现 `yaml` 报错 → 把 `.bak` 改回原名重来。

## 其他小修
- 表格两行文字改为"按第 7 步表格逐项检查，不对就改"。
- 删掉"与旧系统相同的值"的说法。

## 输出
新文件 学分认证系统部署说明-修正版_v4.docx（第 3 版保留），生成后逐页转图片检查排版。
