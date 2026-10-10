# 重新部署前的确认说明

## 回答你的三个问题

**1. 老师和学生会没有吗？—— 会，全部清空。**
迁移包里的建库脚本（init.sql）会把服务器上现有的数据库清空重建，所有账号（学生、老师、管理员）和申请记录都会删除。迁移完成后需要重新建学院、导入老师和学生名单。

**2. 管理员和超管还会存在吗？—— 会给你留一个。**
迁移包里已准备好 admin-account.txt，建库后会自动创建一个超级管理员账号，用它登录后再在系统里重新创建其他管理员和导入老师、学生。

**3. AI 鉴别和大模型要重新弄吗？—— 是的，要重新配。**
AI 模型的密钥存在数据库里，清库后就没了。迁移完成后用超管登录，进入「AI 模型」页面重新填写密钥即可（和上次配置方法一样）。没配之前，AI 鉴别不会自动运行，但不影响提交和审核。

## 迁移步骤（全部在 1Panel 面板内完成）

1. 改 Supabase 的 3 个地址为 `10.18.0.162` 并重启（/root/supabase-project/.env）
2. 上传 init.sql 到服务器，在 1Panel 终端执行建库命令，确认最后一行是「初始化完成」
3. 上传 functions 文件夹到 /root/supabase-project/volumes/functions/，保留 main 文件夹，重启 supabase-edge-functions 容器
4. 上传 website.zip 到 /opt/1panel/www/sites/localhost/index/，右键解压覆盖
5. 按 openresty-config.txt 核对网站设置，用 admin-account.txt 里的账号登录并马上改密码
6. 登录后重新建学院、导入老师和学生、配置 AI 模型密钥

## 迁移前建议

- 如果服务器上现有数据还想保留，先在 1Panel 文件里把 /root/supabase-project/volumes/db/data 整个文件夹打包备份一份，出问题可以恢复。
