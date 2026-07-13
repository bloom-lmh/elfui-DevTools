# ElfUI DevTools 实现计划（对标 Vue DevTools）

> 状态：提案
>
> 首个目标：`@elfui/devtools` 0.1（仅开发环境）

## 目标

Vue DevTools 将框架的组件、状态、更新过程和生态插件变为可检查的信息。ElfUI DevTools 要提供相同类型的能力，但以原生 Custom Elements 与 Shadow DOM 为中心，而不是依赖 Vue 运行时。

首个版本需要让开发者能够：

1. 找到页面中的所有 ElfUI 应用和组件。
2. 点选页面元素，定位并高亮对应的 `elf-*` 组件。
3. 查看组件树、props、attrs、setup 状态、生命周期和错误。
4. 从组件跳到 `.elf` / TypeScript 源文件。
5. 查看状态变更、组件更新与 `emit` 的时间线。

`elfui-docs` 是第一个真实验收场景：Vue DevTools 用于 VitePress 文档站本身，ElfUI DevTools 用于文档中的 ElfUI demo；二者可以同时开启。

## 对标 Vue DevTools 的能力范围

| Vue DevTools          | ElfUI DevTools 对应能力                    | 优先级 |
| --------------------- | ------------------------------------------ | ------ |
| 多应用选择            | ElfUI 根应用和独立顶层 Custom Element 选择 | P0     |
| Components            | 组件树、props、attrs、setup 状态、生命周期 | P0     |
| Component Inspector   | 悬停高亮、点击选中、打开源码               | P0     |
| 组件状态编辑          | 安全编辑 props、Ref、受支持 reactive 路径  | P1     |
| Timeline              | mount、unmount、update、emit、状态变更     | P1     |
| Router                | 路由表、当前路由、导航与守卫事件           | P2     |
| Pinia / 插件面板      | 第三方检查器与时间线扩展 API               | P2     |
| Assets / Graph        | Vite 产物和模块依赖分析                    | P3     |
| 浏览器扩展 / 独立窗口 | 复用同一协议的不同宿主                     | P3     |

0.1 不包含生产远程调试、时间旅行、任意第三方 Web Component 状态推断，也不读取 closed Shadow Root 的内部 DOM。

## 现有 ElfUI 基础与缺口

### 可复用基础

- `defineCustomElement()` 将组件定义保留在构造器的 `__elfDefinition`。
- runtime 在挂载时已把 `ComponentInstance` 关联到 host，且内部可以从 host 反查实例。
- `ComponentInstance` 已有 mount、update、unmount、attribute、错误和 KeepAlive 生命周期。
- reactivity 已有 `ReactiveEffect`、track / trigger；`useRef(value, name)` 已支持可选调试名。
- compiler 已产出组件 metadata；可扩展为开发时的文件和行列号。

### 必须补齐的能力

1. 全局 app / component 注册表；当前只能从已知 DOM host 反查实例。
2. 将 setup 返回值、expose 和已登记调试状态安全地关联到 `ComponentInstance`。
3. 开发时 DevTools bridge、消息协议、版本协商和安全 serializer。
4. 组件 source location 与模板绑定 metadata。
5. Vite Client 注入、Inspector Overlay 与 open-in-editor 服务端端点。
6. 组件、响应式、事件和 Router 的统一时间线事件。

## 推荐架构

```text
ElfUI runtime / reactivity / router        @elfui/vite-plugin
              |                                   |
              +------- dev-only bridge -----------+
                              |
         window.__ELFUI_DEVTOOLS_GLOBAL_HOOK__
                              |
          @elfui/devtools-shared（协议、快照、序列化）
                    |                       |
     @elfui/devtools-client      @elfui/devtools-vite
      （面板 / Inspector）        （注入 / 源码定位）
                    |
        浏览器扩展与独立窗口（后续复用协议）
```

### 建议包划分

| 包                        | 职责                                                         |
| ------------------------- | ------------------------------------------------------------ |
| `@elfui/devtools-shared`  | 协议类型、ID、不可变快照、值序列化、版本协商；不依赖 DOM。   |
| `@elfui/devtools-runtime` | 仅 DEV：实例登记、状态/生命周期/事件采集、global hook。      |
| `@elfui/devtools-client`  | Shadow DOM 隔离的浮动入口、Inspector Overlay、组件树与详情。 |
| `@elfui/devtools-vite`    | Client 注入、源码 metadata、打开编辑器端点。                 |
| `@elfui/devtools-router`  | 可选的 `@elfui/router` 检查器和导航时间线。                  |

第一阶段可以先把 runtime bridge 放在 `@elfui/runtime/internal`，但协议、Client、Vite 插件必须保持独立，避免把 DevTools UI 打进应用包。

## 核心设计

### 1. DevTools bridge

只在开发构建中创建 `globalThis.__ELFUI_DEVTOOLS_GLOBAL_HOOK__`，提供：

- `registerApp` / `unregisterApp`
- `registerComponent` / `unregisterComponent`
- `getSnapshot(appId, componentId?)`
- `emit(event)` 与 `on` / `off`
- `setValue(request)`：受权限保护的状态编辑
- `registerInspector` / `registerTimelineLayer`：插件扩展

页面内 Client 直接订阅 Hook；浏览器扩展和独立窗口通过 `window.postMessage` 连接。消息必须含 `protocolVersion`、`appId`、`requestId`，并校验来源和版本。

### 2. 组件树与详情

为每个 `createApp()` 根和未归属的顶层 ElfUI host 分配开发期 `appId`。跨 Shadow DOM 时以 `ShadowRoot.host` 上溯；`Teleport`、`KeepAlive` 和动态组件使用逻辑父节点而不是单纯 DOM 位置。

组件详情分为：

- `props`：声明、当前值、来源（attribute / property / State）。
- `attrs`：未声明 attribute。
- `setup` / `exposed`：明确记录的 setup 返回值和 `defineExpose`。
- `provides`：仅显示安全摘要。
- `lifecycle`：挂载状态、更新次数、最近更新时间、错误摘要。
- `dom`：host、shadow mode、渲染根和源码位置。

注册表使用 `WeakRef`；不支持时在 unmount 主动删除，DevTools 不得阻止组件回收。

### 3. 状态快照与编辑

不直接暴露 reactivity 的私有 `WeakMap`。对 Ref / reactive state 注册 getter、受控 setter、类型、只读标志、调试名和 source location：

- 名称优先级：显式 name > 编译器变量名 > 自动匿名名。
- 快照限制深度、条目数和字节数；循环引用使用引用标记。
- 函数、DOM、WeakMap、WeakSet 仅显示摘要，不跨边界传输。
- 默认只读；开启 `Allow state editing` 后，写入必须走 Ref setter 或 reactive 代理，并记录时间线事件。

### 4. Component Inspector 与源码定位

开启 Inspector 后，在 capture 阶段根据 `event.composedPath()` 和 `elementFromPoint()` 找到最近 ElfUI host，绘制高亮框、tag 和组件名；点击后选中组件并打开详情。`Escape` 退出。

它可选中 closed Shadow DOM 的 host，但不读取内部节点；必须显示明确的 ElfUI 标识，以避免与 Vue Inspector 混淆。

compiler metadata 增加 `file`、`line`、`column`、结束位置和模板绑定 ID。`@elfui/devtools-vite` 仅在 dev 时附加该 metadata，并提供受根目录限制的 open-in-editor 端点和可配置 `launchEditor`。

### 5. 时间线与扩展

内置层：

| 层             | 事件                                                           |
| -------------- | -------------------------------------------------------------- |
| Component      | mount、unmount、activate、deactivate、render、update、error    |
| Reactivity     | state write、computed invalidation、effect run、watch callback |
| Events         | `ctx.emit()`、可识别的编译期事件绑定                           |
| Router（可选） | navigation start、guard、resolve、commit、error                |

事件包含时间戳、app/component ID、摘要、持续时间与关联绑定 ID。使用有上限的环形缓冲区，默认最多 1,000 条且不采集完整敏感值。

第三方通过命名空间隔离的 inspector、timeline layer、命令和状态编辑器扩展，不允许直接跨边界传递任意运行时对象。

## 实施里程碑

### M0：协议与测试基础

- 建立 `devtools-shared` 的协议、serializer、版本协商和单元测试。
- 定义 DEV / production 边界，确保生产包不包含 global hook 和 Client。
- 建立普通组件、嵌套 Shadow DOM、Teleport、KeepAlive、async setup、多 app fixture。

验收：协议与 UI 解耦；production dist 不含 DevTools 注入。

### M1：只读检查器（0.1 MVP）

- runtime 登记 app、组件、逻辑父子关系与生命周期计数。
- 保存 setup state / exposed 的只读调试快照。
- 提供 Client：应用选择、组件树、props、attrs、状态和生命周期详情。
- 提供 Inspector 高亮和树/页面双向选中。
- 在 `elfui-docs` 开发模式集成 `DemoCounter` 验收。

验收：点选 `<elf-demo-counter>` 可显示正确组件层级与当前 prop；关闭面板后不拦截应用事件。

### M2：源码定位与状态编辑

- compiler / Vite 输出 source metadata。
- Vite 注入 Client，并支持 open in editor。
- Ref / reactive 的受控编辑、权限开关和错误提示。
- 记录 prop 改变、state 写入和 `ctx.emit()`。

验收：可从 `DemoCounter.elf.ts` 组件跳到正确文件和行号；编辑 `count` 后按正常响应式路径更新。

### M3：时间线与性能

- 接入组件、reactivity、事件三层。
- 提供筛选、组件关联、耗时和详情。
- 添加带/不带 Client 的浏览器基准及卸载后内存测试。

验收：一次点击能关联 state write 和 DOM update；事件和内存不会无限增长。

### M4：Router 与插件 API

- 发布 Router adapter。
- 发布 inspector / timeline 插件 API 和示例 adapter。
- 完善文档、兼容性和升级策略。

### M5：浏览器扩展与独立宿主

- 实现 Chrome / Edge 扩展。
- 保持与页面内 Client 相同的协议和功能。
- 评估独立窗口、远程调试和多标签支持。

## 质量门槛

| 层级         | 要求                                                     |
| ------------ | -------------------------------------------------------- |
| 单元         | serializer、循环引用、编辑权限、协议版本、树构建。       |
| runtime 集成 | Shadow DOM、Teleport、KeepAlive、async setup、错误处理。 |
| 浏览器 E2E   | Inspector、高亮、面板同步、状态编辑、打开编辑器。        |
| 构建         | dev 注入存在；production 无 UI/Hook；符合 CSP。          |
| 性能         | 大树、高频 signal、事件上限、卸载后的 GC 友好性。        |
| 文档站       | Vue DevTools 与 ElfUI DevTools 同时运行且不互相干扰。    |

## 首个实现切片

1. 在 `@elfui/runtime/internal` 加入仅 DEV 的 bridge 与实例注册表。
2. 扩展 `ComponentInstance`：debug ID、app ID、setup state、更新计数。
3. 建立 `@elfui/devtools-shared` 的树/详情协议和安全 serializer。
4. 建立最小 `@elfui/devtools-vite` 与 Shadow DOM 隔离的只读 Client。
5. 在 `elfui-docs` 接入并为 `DemoCounter` 写浏览器验收。

先完成这条只读、可定位的链路；之后再增加状态编辑、source mapping、时间线和生态面板。这样每一阶段都可独立测试、发布和回退。
