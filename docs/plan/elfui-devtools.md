# ElfUI DevTools 对标 Vue 3 DevTools 开发计划

> 调研基线：Vue DevTools 8.1.x（Vue 3）
>
> 计划更新时间：2026-07-15
>
> 当前 ElfUI DevTools：0.0.x 技术原型

## 本轮推进状态（2026-07-15）

本轮完成了 Phase 0–1 的第一条纵向链路，但两个阶段均未完成，不能按里程碑发布：

- [x] `createApp()` 分配稳定 app ID，并发出 app mount/unmount 开发态事件。
- [x] ElfUI runtime 发出 component mount/update/unmount/error/emit 事件；update 按微任务合并。
- [x] runtime debug record 已接入 props、attrs、setup state、exposed、source metadata。
- [x] DevTools bridge 优先消费 runtime 事件；保留 DOM 扫描作为晚加载兼容路径。
- [x] 页面底部居中双按钮、默认隐藏面板、Inspector 选中后自动打开面板。
- [x] DevTools UI 使用 Shadow DOM 隔离；补充 bridge、adapter、panel 和 runtime 集成测试。
- [x] `elfui-docs` 本地开发配置完成 Vite 插件接入，并通过真实浏览器验证双入口和面板开关。
- [ ] Phase 0 剩余：逻辑父子记录、Teleport/KeepAlive fixture、WeakRef/GC、reactivity 链路、版本化 RPC 与能力协商。
- [ ] Phase 1 剩余：停靠/缩放/全屏、导航与 app selector、主题和布局持久化、完整键盘/ARIA、视觉 E2E。

下一步严格按顺序推进：先完成逻辑组件树与可回收 debug record，再做响应式因果链和 RPC，之后完善面板外壳；在这些验收完成前不进入 Assets、Graph、浏览器扩展或 standalone。

## 1. 目标与边界

目标不是复制 Vue DevTools 的界面，而是让 ElfUI 开发者获得同等级的核心调试体验：理解应用、检查组件、编辑状态、定位源码、分析更新、调试路由与生态插件，并能在页面内、浏览器扩展和独立窗口中使用同一套能力。

ElfUI 基于原生 Custom Elements、Shadow DOM 和编译期细粒度更新，因此下列能力需要按 ElfUI 语义实现：

- 组件树使用 ElfUI 的逻辑父子关系，不以 DOM 嵌套关系代替。
- 状态面板展示 props、attrs、setup state、exposed、provides 和响应式依赖。
- 性能时间线记录细粒度 binding/effect 更新，而不是 Vue 的 VDOM render/patch。
- Inspector 必须正确跨越 open Shadow Root；closed Shadow Root 只定位 host，不读取内部 DOM。
- DevTools 代码和元数据默认只存在于开发构建中。

目标分两层：

1. **核心对标**：组件、状态编辑、Inspector、源码跳转、Timeline、Router、插件 API、多应用和成熟面板体验。
2. **平台对标**：Assets、模块图、Vite Transform Inspect、分屏、独立窗口、浏览器扩展和 standalone。

## 2. Vue DevTools 8.1.x 能力基线

Vue 官方当前公开的功能包括：

| 能力域                      | Vue DevTools 能力                                      |
| --------------------------- | ------------------------------------------------------ |
| Overview                    | Vue 版本、页面、组件等应用概览                         |
| Pages                       | 当前页面、路由匹配、参数填写和快速导航                 |
| Components                  | 组件树、状态详情、筛选、状态编辑、滚动定位组件         |
| Timeline                    | 渲染、更新、路由、store 等性能与事件时间线             |
| Assets（Vite）              | 浏览项目资源并执行预览等操作                           |
| Router                      | 路由表、当前路由和详细信息                             |
| Pinia                       | store 列表、状态查看与编辑、时间旅行相关能力           |
| Graph                       | 展示模块关系                                           |
| Settings                    | DevTools 行为、外观和功能设置                          |
| Inspect（Vite）             | 查看 Vite 插件对模块的逐步转换结果                     |
| Component Inspector（Vite） | 页面悬停高亮、点击定位组件、打开源码                   |
| Separate Window（Vite）     | 将面板放到独立窗口                                     |
| Command Palette             | `Ctrl/Cmd + K` 搜索页面、命令和文档入口                |
| Multiple Apps               | 在同一页面的多个应用实例之间切换                       |
| Split Screen                | 同时查看两个 DevTools 页面                             |
| Plugin API                  | 自定义 Tab、命令、Inspector、Timeline layer 和生态集成 |
| 多宿主                      | Vite 页面内面板、Chrome/Firefox 扩展、standalone       |

Vue DevTools 的仓库也按 client、core、devtools-kit、devtools-api、overlay、vite、浏览器扩展和 Electron 等包拆分。ElfUI 后续应保持同样的“核心能力与宿主分离”原则。

## 3. 当前 ElfUI DevTools 审计

### 3.1 已实现

| 能力            | 当前实现                                                     | 证据/限制                                                   |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| 基础协议        | `protocolVersion = 1`，定义 app、component、timeline 快照    | 只有页面内同步调用，没有请求/响应、握手和跨宿主 transport   |
| 安全序列化      | 支持循环引用、深度/条目限制及特殊类型摘要                    | 缺少惰性展开、大对象分页和可编辑路径                        |
| 组件登记        | runtime 主动发送 app/component 生命周期事件                  | 晚加载兼容仍使用 DOM 扫描与 MutationObserver                |
| 基础组件树      | runtime 传递 app ID 和父 host，client 按层级缩进             | 仍不是完整逻辑树；Teleport、KeepAlive、动态组件需补 fixture |
| 基础组件详情    | 真实读取 props、attrs、setup、exposed 和 source metadata     | provides/injects、refs、computed 与响应式依赖尚未接入       |
| 基础 Inspector  | 悬停高亮、点击选中、Escape 退出                              | 没有组件标签、滚动定位、源码跳转、快捷键和双向同步完善      |
| 基础 Timeline   | 自动采集 mount/unmount/update/error/emit，update 微任务合并  | 没有时长、过滤、性能指标和响应式因果链                      |
| Vite 开发注入   | `apply: "serve"`，通过虚拟模块加载客户端                     | 只有 HTML 注入；缺少 `appendTo`、CSP、SSR/无 HTML 入口策略  |
| 全局 hook       | runtime 与 bridge 通过 `__ELFUI_DEVTOOLS_GLOBAL_HOOK__` 连接 | 仍是同页事件接口，未升级为版本化 RPC/插件协议               |
| Source 字段展示 | 可读取构造器上的 `__elfSource` 并显示                        | 编译器未系统生成 metadata，Vite 也没有 open-in-editor 服务  |
| 最小测试        | DevTools 13 个测试，并有真实 ElfUI runtime/app 集成测试      | 已手工浏览器验收；仍缺自动浏览器 E2E、性能和扩展测试        |

### 3.2 部分实现但不可视为完成

- **Components**：已有层级缩进和 Inspector 选中联动，但没有折叠、搜索、多选/负向过滤、面包屑和大树虚拟滚动。
- **应用模型**：已接入 `createApp()` 的稳定 ID 与 mount/unmount；晚加载扫描仍会为未知顶层 host 创建兼容 app，UI 也没有 app selector。
- **状态检查**：已读取真实 `ComponentInstance` 的 setup state 和 exposed；provide/inject、refs、computed、编辑能力和响应式节点仍未实现。
- **更新记录**：ElfUI runtime 已主动发送合并后的组件 update 与 emit/error；尚未关联 state write、effect/binding、耗时和源码。
- **源码定位**：只能显示预先存在的文件行列，不能点击打开编辑器，也没有模板 binding 级位置。
- **UI**：已有 Vue 风格双按钮启动器、默认隐藏的 Shadow DOM 面板和关闭行为；仍缺停靠/缩放、导航、完整键盘操作、主题和布局持久化。

### 3.3 完全未实现

| Vue 能力                                   | ElfUI 状态                 | 优先级 |
| ------------------------------------------ | -------------------------- | ------ |
| Overview                                   | 未实现                     | P1     |
| Pages                                      | 未实现                     | P2     |
| 完整 Components 体验                       | 大部分未实现               | P0     |
| 状态实时编辑                               | 未实现                     | P0     |
| 性能 Timeline                              | 未实现                     | P0     |
| Events/Reactivity Timeline                 | 未实现                     | P0     |
| Assets                                     | 未实现                     | P3     |
| Router                                     | 未实现                     | P1     |
| Pinia 对应的 store inspector / time travel | 未实现                     | P2     |
| Graph                                      | 未实现                     | P3     |
| Settings                                   | 未实现                     | P1     |
| Vite Transform Inspect                     | 未实现                     | P3     |
| Open in editor                             | 未实现                     | P0     |
| Separate Window                            | 未实现                     | P2     |
| Command Palette                            | 未实现                     | P2     |
| Multiple Apps                              | runtime 已识别，缺 UI 切换 | P1     |
| Split Screen                               | 未实现                     | P3     |
| Plugin API                                 | 未实现                     | P1     |
| Chrome/Firefox extension                   | 未实现                     | P3     |
| Standalone / remote transport              | 未实现                     | P3     |

## 4. 目标架构

```text
@elfui/runtime + @elfui/reactivity + @elfui/router + compiler metadata
                              |
                   dev-only instrumentation
                              |
              @elfui/devtools-runtime / global hook
                              |
           versioned RPC protocol + transport abstraction
             /                |                 \
        in-page          browser extension      standalone
        Vite UI          content/devtools        WebSocket
             \                |                 /
                 @elfui/devtools-client
              shell + panels + plugin host
                              |
   Components / Timeline / Router / Store / Assets / Inspect / Graph
```

建议包结构：

| 包                           | 职责                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| `@elfui/devtools-shared`     | 协议、RPC 消息、serializer、能力协商、公共类型                     |
| `@elfui/devtools-runtime`    | app/组件注册、状态访问器、生命周期与事件采集、全局 hook            |
| `@elfui/devtools-client`     | UI shell、启动器、各功能面板、命令与设置                           |
| `@elfui/devtools-vite`       | 注入、source metadata、open-editor、Assets、模块图、transform 数据 |
| `@elfui/devtools-api`        | 第三方自定义 Tab、命令、Inspector 和 Timeline API                  |
| `@elfui/devtools-router`     | ElfUI Router adapter                                               |
| `@elfui/devtools-extension`  | Chrome/Edge/Firefox 宿主及页面桥接                                 |
| `@elfui/devtools-standalone` | WebSocket server、独立窗口和远程调试                               |

## 5. 分阶段开发计划

### Phase 0：可观测性地基（P0，1–2 周）

目标：让数据来自 ElfUI runtime，而不是事后扫描 DOM 猜测。

- 在 ElfUI runtime 增加仅开发态的 hook：app create/mount/unmount、component create/mount/update/unmount/activate/deactivate/error、emit。
- 在 `createApp()` 分配稳定 app ID，组件实例保存 app ID、parent ID 和 logical children。
- 暴露只读且可回收的 component debug record；使用 WeakRef/显式 unmount，避免 DevTools 阻止 GC。
- 接入 setup state、exposed、provides、props state、source metadata。
- 在 reactivity 增加可开关的 ref/reactive/effect/watch 调试事件和 debug name。
- 把直接 bridge 调用升级为带 `protocolVersion`、`requestId`、能力协商和错误码的 RPC。
- 建立真实 ElfUI fixture：Shadow DOM、Teleport、KeepAlive、Suspense、动态组件、多个 app。

验收：

- 不启用 DevTools 时生产构建无 hook、无客户端、无调试 metadata。
- 启用后逻辑组件树在上述 fixture 中全部正确。
- 一次状态变更可关联到 state write、effect/binding update 和 component ID。
- app/component 卸载后不会被 DevTools 强引用。

### Phase 1：产品外壳与 Vue 风格入口（P0，1–2 周）

目标：先达到可长期扩展的 DevTools 使用形态。

- 底部居中双按钮：ElfUI DevTools 开关 + Component Inspector 开关。
- 面板默认隐藏，支持浮层、底部/左右停靠、拖动尺寸、全屏和关闭。
- Shadow DOM 隔离 DevTools 样式，支持亮色/暗色/跟随系统。
- 建立侧边导航、顶栏、app selector、连接状态和版本不兼容提示。
- 面板尺寸、停靠位置、主题、最后打开 Tab 持久化。
- 键盘和无障碍：焦点管理、Escape、快捷键、ARIA、减少动画。
- 建立前端组件库和 UI 视觉回归测试，替换 inline style/整页重绘。

验收：

- 入口行为与 Vue DevTools 双按钮一致，且不会遮挡页面核心交互。
- 面板开关不丢失 runtime 数据；刷新后恢复设置。
- DevTools 自身 DOM/CSS 不污染被调试页面。

### Phase 2：Components 完整对标（P0，2–3 周）

目标：完成最重要的组件调试闭环。

- 逻辑组件树：折叠、虚拟滚动、名称/文件过滤、多个条件、状态标记。
- 树与页面双向定位：选中树节点高亮页面；Inspector 点击后聚焦树节点。
- 详情分类：props、attrs、setup state、computed、exposed、provides/injects、refs、lifecycle、DOM/Shadow 信息。
- 可惰性展开的安全 value inspector：循环引用、Map/Set、Error、DOM、Promise、大数组分页。
- 状态编辑：类型校验、只读标识、通过 Ref setter/reactive proxy 写入、失败回滚。
- 组件操作：scroll into view、复制名称/路径、打开源码、复制序列化状态。
- Inspector 增加组件标签、边界信息、快捷键和 iframe/open Shadow Root 支持。
- compiler 生成组件及 binding 级 source location；Vite 提供受根目录约束的 open-in-editor endpoint。

验收：

- 在文档站真实 Demo 上能检查并编辑 Counter 状态，页面立即正常响应。
- 点击组件名能打开准确文件、行、列。
- 5,000 节点组件树仍可流畅搜索、展开和选择。

### Phase 3：Timeline 与性能分析（P0，2–3 周）

目标：解释“什么触发了什么更新，以及花了多久”。

- 内置 layer：Component、Reactivity、Events、Performance、Errors。
- 记录 mount/update/unmount、state write、computed invalidation、effect run、watch callback、emit。
- 使用 `performance.now()` 和 Performance API 记录开始/结束、耗时、关联 component/binding/source。
- 时间线瀑布、缩放、暂停/恢复、清空、layer/组件/事件过滤、事件详情。
- 关联链：用户事件 → emit/state write → effect/binding → DOM update。
- 环形缓冲、采样和 payload 大小限制；高频事件背压。
- 导入/导出诊断快照，敏感数据默认只保留摘要。

验收：

- 一次按钮点击可完整追踪到具体响应式状态与 DOM binding 更新。
- 高频 10,000 次状态变更不会无限增长内存或冻结页面。
- DevTools 关闭采集后，基准性能开销低于设定预算。

### Phase 4：Overview、Router、Store 与多应用（P1/P2，2–3 周）

目标：覆盖 Vue DevTools 日常使用的应用级调试。

- Overview：ElfUI/runtime/compiler/devtools 版本、app 数、组件数、当前路由、能力状态。
- Multiple Apps：基于 `createApp()` 注册准确切换，不把独立顶层组件误判为新 app。
- Router：当前路由、路由表、params/query/meta、匹配链、导航和守卫时间线、可控导航。
- Pages：页面列表、动态参数输入、匹配测试和快速导航。
- Store inspector API：store/state/getter/action 列表、编辑、快照、action timeline。
- 可选时间旅行：由 store adapter 提供 snapshot/restore，不强行序列化任意 ElfUI 状态。

验收：

- 同页两个 ElfUI app 可独立查看，卸载其中一个不会影响另一个。
- Router 导航可从开始、守卫到提交/错误完整追踪。
- store adapter 能编辑状态并在快照之间恢复。

### Phase 5：扩展 API、设置与命令面板（P1/P2，2 周）

目标：让 Router、store 和第三方库不必修改 DevTools 核心。

- 发布 `@elfui/devtools-api`。
- API：`addCustomTab`、`removeCustomTab`、`addCustomCommand`、custom inspector、timeline layer、state editor。
- 插件注册包含 ID、版本、app scope、权限和 dispose 生命周期。
- Command Palette：Tab 导航、组件搜索、运行命令、打开文档。
- Settings：主题、快捷键、Inspector、采样、事件 payload、状态编辑授权、隐私选项。
- 插件错误隔离和性能预算，避免第三方插件拖垮面板。

验收：

- Router/store 都通过公共 API 接入，不依赖 client 私有模块。
- 示例插件能注册 Tab、命令、Inspector 和 timeline layer，并可完整卸载。

### Phase 6：Vite 高级功能（P3，2–3 周）

目标：对齐 `vite-plugin-vue-devtools` 相比浏览器扩展更强的能力。

- 插件选项：`enabled`、`appendTo`、`componentInspector`、`launchEditor`、快捷键、host/port。
- 支持 HTML 注入与无 HTML 入口；评估 SSR、CSP nonce 和 middleware mode。
- Assets：publicDir/src 资源索引、预览、复制路径、打开文件。
- Graph：模块依赖、组件依赖、路径搜索和循环依赖提示。
- Inspect：接入 Vite plugin transform 结果，查看每一步 code/map/diff。
- Separate Window 与 Split Screen。

验收：

- VitePress、普通 Vite SPA 和 middleware mode 都可启动。
- open-editor 路径校验阻止打开工作区之外文件。
- Assets/Graph/Inspect 在大项目中分页、取消请求且不阻塞开发服务器。

### Phase 7：浏览器扩展与 standalone（P3，3–5 周）

目标：实现与 Vue DevTools 相同的多宿主覆盖。

- 抽象 transport：in-page、`window.postMessage`、extension port、WebSocket。
- Chrome/Edge DevTools Panel、content script、page hook；Firefox 兼容构建。
- 协议握手、来源验证、权限边界、断线重连、版本降级。
- standalone 桌面/网页客户端和本地 WebSocket server。
- 远程设备、Electron、iframe 和多标签页调试。
- 所有宿主复用同一 client panels 和插件 API。

验收：

- 同一 fixture 在 Vite 页面内、Chrome DevTools Panel 和 standalone 中通过同一套 E2E 用例。
- 扩展不在非 ElfUI 页面激活，且跨页面消息不能执行任意代码或任意文件访问。

## 6. 发布里程碑

| 版本          | 包含阶段         | 对用户的意义                                        |
| ------------- | ---------------- | --------------------------------------------------- |
| `0.1.0-alpha` | Phase 0–1        | 正确接入 runtime，并有成熟的双按钮与面板外壳        |
| `0.2.0-alpha` | Phase 2          | Components、状态编辑、Inspector、源码跳转可日常使用 |
| `0.3.0-beta`  | Phase 3          | Timeline 与性能分析闭环完成                         |
| `0.4.0-beta`  | Phase 4–5        | Router、store、多应用、插件 API 完成                |
| `0.5.0-beta`  | Phase 6          | Vite 页面内版本功能基本对标 Vue DevTools            |
| `1.0.0`       | Phase 7 + 稳定化 | Vite、浏览器扩展、standalone 多宿主稳定发布         |

## 7. 测试与质量门槛

| 层级               | 必须覆盖                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| 单元测试           | serializer、RPC、能力协商、树构建、过滤、状态编辑、插件生命周期          |
| ElfUI runtime 集成 | Shadow DOM、Teleport、KeepAlive、Suspense、async setup、错误边界、多 app |
| Vite 集成          | 注入、appendTo、CSP、open-editor、生产排除、模块图、transform inspect    |
| 浏览器 E2E         | launcher、Inspector、树/页面同步、编辑、Timeline、Router、设置持久化     |
| 跨宿主契约         | in-page、extension、standalone 对同一协议测试套件                        |
| 性能               | 5,000 组件、大对象、10,000 高频事件、长时间运行、关闭后的 GC             |
| 安全               | serializer 脱敏、路径穿越、消息来源、插件权限、CSP、任意代码执行防护     |
| 可访问性           | 键盘操作、焦点、ARIA、对比度、缩放、减少动画                             |

每个 Phase 完成条件：实现代码、自动化测试、文档、真实 `elfui-docs` 验收场景四项同时完成；仅有协议字段或静态 UI 不计为功能完成。

## 8. 进度衡量与现实工期

按功能数量计算没有意义，应按可验收用户闭环计算。当前原型大约完成：

- 核心对标范围：约 **10%–15%**。
- Vue DevTools 全平台范围：约 **5%–8%**。

单名熟悉 ElfUI、Vite 和浏览器扩展的工程师，完成 Vite 页面内核心对标预计约 **10–15 周**；加入浏览器扩展、standalone、性能与稳定化后，完整 1.0 预计约 **16–24 周**。多人并行可以缩短日历时间，但 Phase 0 的 runtime/协议地基不能跳过。

最近一个开发迭代应只锁定 Phase 0 和 Phase 1。第一条可交付纵切是：

1. `createApp()` 和 ComponentInstance 发出真实开发态事件。
2. client 通过版本化 RPC 获取准确 app/组件树。
3. 页面显示底部居中双按钮，面板默认关闭。
4. Inspector 点击真实 ElfUI 组件后，树自动选中并显示 props/attrs/setup。
5. 在 `elfui-docs` 用真实 Counter fixture 完成浏览器 E2E。

这条纵切完成前，不开始 Assets、Graph、扩展或 standalone。

## 9. 调研来源

- Vue DevTools Features：https://devtools.vuejs.org/getting-started/features
- Vue DevTools Vite Plugin：https://devtools.vuejs.org/guide/vite-plugin
- Open component in editor：https://devtools.vuejs.org/getting-started/open-in-editor
- Vue DevTools Plugin API：https://devtools.vuejs.org/plugins/api
- Vue DevTools Installation：https://devtools.vuejs.org/getting-started/installation
- Vue DevTools repository：https://github.com/vuejs/devtools
