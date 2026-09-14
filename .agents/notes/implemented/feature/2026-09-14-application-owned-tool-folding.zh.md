# Agent Note: 应用控制的工具折叠

Status: implemented

[English](2026-09-14-application-owned-tool-folding.md) | 中文

## Problem

同一轮次中，后续工具执行产生另一条回复时，紧凑 Chat 可能隐藏之前有用的 Assistant 回复。要求每条回复始终可见的应用无法仅替换 Assistant renderer 解决问题，因为外层 Chat Node Seat 控制可见性。

## Decision

可选的 `ui-chat` 配置 `toolsOnlyTranscript` 将已完成轮次的折叠范围限制为工具节点，保持消息原有顺序，并从折叠摘要中移除消息数量。它隐藏偏好选择器，忽略持久化模式偏好，但不迁移或覆盖它们。默认仍为上游标准/紧凑行为。对话投影、Session 事件和提供方请求均不变。

保留既有的最终正文、轮次已关闭和历史完整要求。搜索与键盘焦点显露机制仍会展开隐藏的工具。推理保留自身 renderer 的展开入口，不被工具开关隐藏。

客户端模块图不会隐式转发 Host 插件配置。Host 仅通过 `webserver/index-inject` 发布该公开策略，浏览器在注册 Chat 前校验启动数据。录制 Session 的浏览器回放同时覆盖此传输和工具可见性，因为直接挂载客户端的测试无法发现缺失的 Host 到浏览器交接。

## Alternatives considered

- 替换 Assistant renderer 无法绕过隐藏的祖先节点。
- CSS 覆盖会让应用依赖私有布局细节，并留下不一致的偏好行为。
- 新增第三种持久化模式会要求迁移用户选择，尽管该策略由应用控制。

## Consequences

应用通过装配获得固定展示策略，而非维护下游对话展示分叉。后续升级仍需保留一个小型核心配置依赖。集成测试须覆盖正文与工具混排、仅工具计数、旧偏好、部分历史、运行结束以及未改变的上游行为。
