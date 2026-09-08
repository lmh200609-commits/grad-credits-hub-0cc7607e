# 教师端「班级学分」页面

在教师端新增一个按班级汇总的页面，方便按班看整体情况，而不是只看单个学生。

## 页面内容

新增菜单「班级学分」（位于「学分排名」下方），路由 `/teacher/classes`，教师与管理员可见。

顶部四个统计卡：班级数、学生总数、整体合格率、平均学分。

班级列表表格（可搜索班级/专业，可按任意列排序）：

| 排名 | 班级 | 专业 | 人数 | 已认定总学分 | 人均学分 | 合格人数 | 合格率 | 操作 |

- 排名：按人均学分从高到低（同分并列）
- 合格：学生累计学分 ≥ 4
- 「操作」进入班级明细：该班学生名单（姓名、学号、累计学分、成绩等级、是否合格），沿用现有学生详情入口

## 导出

页面右上角「导出班级汇总表」按钮，生成 Excel：
- 第一张表「班级汇总」：上表全部列（按当前筛选结果导出）
- 第二张表「学生明细」：班级、专业、姓名、学号、累计学分、成绩等级、是否合格

文件名：`班级学分汇总_日期.xlsx`

## 技术细节

- 数据复用现有 `get_student_credit_ranking` RPC（已含 `class_name`、`major`、`college_id`、`total_credit`、`approved_count`），前端按 `class_name` 分组聚合，无需数据库改动。
- 成绩等级沿用 `src/lib/creditStandard.ts` 的 `gradeOf`；合格线常量 4，与 `src/pages/teacher/Credits.tsx` 保持一致。
- 新增 `src/pages/teacher/Classes.tsx`，样式与组件（`PageHeader`、`StatCard`、`Table`、`TablePagination`）沿用 `Credits.tsx` 的写法。
- 导出用已有的 `xlsx` 依赖，`XLSX.utils.aoa_to_sheet` + 两个 sheet。
- 在 `src/App.tsx` 注册路由（`RoleRoute role={["teacher","admin"]}`），在 `src/components/AppLayout.tsx` 教师菜单与面包屑标题中加入该页。
