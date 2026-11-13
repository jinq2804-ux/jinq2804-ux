# 部署说明：答题卡识别与真实 AI 批改

## 这次已加入的功能

1. 作文正文切换到“图片导入”后，可选择一张完整横向答题卡。浏览器会自动旋转、裁掉题干/姓名/条码区域、过滤红色分数与批注，再按左→中→右三栏识别手写作文。
2. 评分改为“先判区间，再区间内定分”。本次 Word 文档中的 74 篇教师核定作文已做成评分参照库；只在“突围与成长”同题作文中启用，不会套用到其他题目。
3. 智能出题和 AI 批改重新调用真实 Express 后端。DeepSeek 调用失败时会直接显示原因，不再悄悄返回呆板模板。

## Render 后端必须配置

旧的 `json-server` 不能提供 `/api/corrections/analyze`、`/api/questions/generate-custom` 和 `/api/ocr`。必须把本项目的 `Dockerfile` 部署为 Render Web Service。

环境变量：

```text
AI_MODE=deepseek
AI_FALLBACK_TO_MOCK=false
DEEPSEEK_API_KEY=你的DeepSeek密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
JWT_SECRET=一段至少32位的随机字符串
OCR_PROVIDER=tencent
TENCENT_SECRET_ID=你的腾讯云SecretId
TENCENT_SECRET_KEY=你的腾讯云SecretKey
TENCENT_REGION=ap-guangzhou
```

部署成功后打开 `https://你的Render域名/api/health`，应返回 `ok: true`。Render 管理网页可以关闭，不影响服务；免费服务长时间没人访问会休眠，第一次打开可能需要等待几十秒。

## Netlify 前端

仓库部署时已经提供 `netlify.toml`；手动部署也可以直接拖入 `client/dist` 文件夹。若 Render 域名仍是当前地址，已构建的 dist 可直接使用。

如果 Render 域名发生变化，在 Netlify 增加环境变量后重新构建：

```text
VITE_API_BASE_URL=https://你的Render域名/api
```

注意末尾必须是 `/api`。

## 数据为什么可能消失

本项目目前仍用 `db.json` 保存账号、题库和批改记录。Render 免费实例的本地文件不是持久存储，服务重建或重新部署后，新写入的数据可能消失；这与浏览器是否关闭无关。

若要长期保存数据，请二选一：

- 在 Render 使用 Persistent Disk，并把 `DATA_FILE` 设为磁盘路径，例如 `/var/data/essay-grader/db.json`；
- 把业务数据迁移到 Render Postgres 等外部数据库。

74 篇评分校准样本是随源码部署的静态文件，不受 `db.json` 重置影响。

## 使用顺序

1. 在“题目信息”选择题目，或粘贴/识别题干。
2. 在“作文正文”选择“图片导入”→“选择整张答题卡”。
3. 等待识别完成，快速校对识别出的文字。
4. 点击“AI 批改”。同题时结果区会显示“人工样本校准”。
5. 教师复核分数和评语后再保存。
