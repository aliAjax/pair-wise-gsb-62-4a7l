# 矿山尾矿库监测计划与异常处置审阅平台

基于Angular、Angular Material、NgRx、Angular Router、RxJS、HttpClient、MapLibre GL、Turf.js、Nx和TypeScript的独立前端工程。无后端时自动使用本地模拟数据，界面内操作保留版本和审计。

## 功能

- 位移、水位、渗流、降雨监测点，MapLibre测点图层和Turf巡检路线长度。
- 阈值草稿提交即**冻结适用版本**：版本链留痕（生效中/已失效），同时冻结重算范围快照（测点、读数、异常）。
- 原始读数只读；每条读数并排保留**原判依据版本**与**当前依据版本**，阈值更新后旧读数保留原判、进入“待重算”。
- 重算任务状态机：同一异常并发只受理一次（重复受理审计驳回）；逐读数断点持久化，失败后从断点恢复；固化前二次校验目标版本仍生效，防止按旧版本返回结果。
- 异常队列、现场复核、证据、复测评估和专业意见并存；异常依据变更链完整保留。
- 处置方案记录依据版本：阈值一更新即暂停按旧依据的批准，重算结论经负责人确认后异常换据、方案继续；重大异常强制应急联动。
- JSON审阅包同时固定阈值版本、异常关联（原判/当前/方案依据、重算任务）和未完成重算清单，重新打开仍按包内同一版本解释。
- 所有操作形成审计时间线。

## 流程校验

`tmp/verify-flow.ts` 覆盖上述可追溯流程（版本冻结、并发去重、断点恢复、防旧版本固化、审批暂停/确认、审阅包重开）：

```bash
node_modules/.bin/esbuild tmp/verify-flow.ts --bundle --platform=node --format=esm --outfile=tmp/verify-flow.mjs && node tmp/verify-flow.mjs
```

端口为`18462`。

```bash
npm install
npm run build
npm run dev
```
