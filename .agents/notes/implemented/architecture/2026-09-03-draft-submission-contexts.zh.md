# Agent Note：插件持有的草稿提交上下文

Status: implemented

[English](2026-09-03-draft-submission-contexts.md) | 中文

## 问题

浏览器插件此前只能把选中文本插入为 Lexical 引用 Chip。隐藏 Chip 虽保留了序列化，却会让键盘删除操作修改不可见内容；即使把插件的可视控件放在图片附件旁，也无法改变编辑器对该内容的所有权。

## 决定

`ui-conversation` 持有 `DraftContextRegistry`。客户端插件注册按会话寻址的 source，在 Lexical 之外保存自己的条目，并仅在普通 composer 开始一次 detached send 时转交。capture 只结算一次：prompt 被接受时退休条目；被拒绝或 scope 销毁时将条目还给 source。

Session prompt RPC 携带仅文本的 `PromptContext`。`dsh-session-controller` 校验它们，并在用户 prompt 调用 `followup()` 或 `steer()` 前立刻对每项调用 `agent.inject()`，写入一条插件来源的 durable user message。模型会在同一次被接纳请求中看到插件上下文，session log 也能重建全部模型可见内容。subagent transport 明确拒绝草稿上下文，不会静默丢弃。

注释上下文记录 `form: 'annotation'`，并把请求 id 写为 `submissionId`。Chat 通过这个 id 与 `source.rpcId` 相同的 user 或 steering message 关联，隐藏独立 context 行，并在已提交消息上方展示所选文本。

已发布的 v0/v1 迁移在收件箱条目与消息表面中校验并保留批注来源。批注要求非空的 `submissionId`，其他 plugin form 拒绝该字段。丢弃标识会破坏对话关联。既有相邻版本迁移事务仅写入带版本名的后继文件，已提交的前代文件保持不变。

`dsh-add-to-chat` 是首个消费者。它按会话保存选中的助手文本，在 composer 附件区域旁渲染列表，不再注册 input-trigger codec 或 Lexical Chip。

## 考虑过的替代方案

**用 CSS 隐藏 Lexical Chip。** 否决：编辑器仍持有隐藏节点，Backspace 与 Delete 仍会修改用户看不见的插件状态。

**把插件文本拼接进用户草稿。** 否决：来源会和用户输入混在一起，session log 无法保留插件来源。

**用户选中时立即注入文本。** 否决：选择应当仍可删除，在用户提交前也不应唤醒或影响之后的 turn。

**为单个集成建立私有提交路径。** 否决：独立安装的 DSH 插件同样需要该生命周期和可追溯来源。

## 后果

插件可以提供可删除的非文件 composer 上下文，而不修改用户编辑器内容。插件需要使用暴露 `conversation.draftContexts` 的 DSH 版本；旧 runtime 会清晰地激活失败。核心 RPC 仅公开文本，二进制附件仍由既有 attachment service 持有。

## 验证

session-controller host spec 验证插件上下文在用户 prompt 被接纳前注入。composer spec 验证空编辑器可以提交上下文、编辑器中没有 occurrence，且拒绝时 source 会恢复。Chat node 与 renderer spec 验证注释聚合、隐藏 context 行和所选文本展开。add-to-chat 浏览器产物通过 `node --check`。
