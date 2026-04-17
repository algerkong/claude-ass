# Claude Loading Art — 设计文档

日期：2026-04-13
状态：已批准，待实现

## 背景

为 `https://claude.ai/*` 实现一个 Chrome MV3 扩展，在 Claude 的 sparkle 图标后方显示用户上传的装饰性背景图，并允许修改图标颜色。详细的技术约束见 `docs/plugin-spec.md`。

本文档基于 `plugin-spec.md`，记录本次实现的具体决策。

## 与原 spec 的差异

| 项 | 原 spec | 本次决策 |
|----|--------|---------|
| 内置插画 | 5 个 SVG | **不内置**，仅支持用户上传 |
| 显示模式 | always / hover / click 三选 | **只有 always**，移除选择 |
| 扩展图标 | 未指定 | 使用 Claude sparkle 图标 |
| 语言 | 未指定 | **TypeScript**（`tsc` 直接编译） |
| popup 风格 | 未指定 | 贴合 Claude 设计语言（深浅色适配、圆角卡片） |

## 项目结构

```
chrome-plugin/
├── manifest.json
├── tsconfig.json
├── package.json
├── src/
│   ├── content.ts
│   ├── popup.ts
│   ├── popup.html
│   ├── popup.css
│   └── types.ts
├── dist/                    # tsc 输出
│   ├── content.js
│   └── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/
    ├── plugin-spec.md
    └── superpowers/specs/2026-04-13-claude-loading-art-design.md
```

## 数据模型 (`src/types.ts`)

```ts
export type Config = {
  selectedImage: string;   // UploadedImage.id，空字符串表示未选
  bgSize: number;          // px，默认 120
  bgOpacity: number;       // 0–100，默认 100
  offsetX: number;         // px，默认 0
  offsetY: number;         // px，默认 0
  svgColor: string;        // CSS 颜色或空
  enabled: boolean;        // 默认 true
};

export type UploadedImage = {
  id: string;              // "upload_" + Date.now() + 随机
  dataUrl: string;         // data:image/...
  name: string;            // 原始文件名
};

export const DEFAULT_CONFIG: Config = {
  selectedImage: "",
  bgSize: 120,
  bgOpacity: 100,
  offsetX: 0,
  offsetY: 0,
  svgColor: "",
  enabled: true,
};
```

存储位置：
- `chrome.storage.sync` → key `claudeLoadingArt`，值为 `Config`
- `chrome.storage.local` → key `uploadedImages`，值为 `UploadedImage[]`

之所以 sync/local 拆分：dataURL 体积大，sync 有 8KB 限额；用户配置小且希望跨设备同步。

## content.ts 职责（约 80–100 行）

1. **实例守卫** — `if (window.__claude_loading_art__) return; window.__claude_loading_art__ = true;`
2. **注入 `<style id="claude-loading-art-style">`** 到 `document.documentElement`，内容固定，使用 `:has()` 选择器和 `::before` 伪元素，所有可变项通过 CSS 变量驱动。CSS 内容见下文。
3. **加载配置** — 并行读 `chrome.storage.sync.get('claudeLoadingArt')` 和 `chrome.storage.local.get('uploadedImages')`，缺失时使用 `DEFAULT_CONFIG` 和 `[]`。
4. **应用配置 (`apply()`)** —
   - 找到当前选中的 `UploadedImage`，把 dataURL 包成 `url("...")` 写入 `--ca-image`
   - 写入 `--ca-size`、`--ca-opacity`、`--ca-ox`、`--ca-oy`
   - `enabled === false` 或没有可用图时 `--ca-display: none`，否则 `block`
   - 调用 `applyColor()` 设置图标颜色
5. **`applyColor()`** —
   - `querySelectorAll('.text-accent-brand, [class*="text-brand"]')`
   - 对每个元素 `el.style.color = config.svgColor || ''`
6. **MutationObserver** — 监听 `document.body` 子树变化，新增元素若匹配选择器则调用 `applyColor()` 仅给新增节点设色（避免全量遍历）。
7. **storage 监听** — `chrome.storage.onChanged.addListener` 中区分 sync/local，重读后调用 `apply()`。

### 注入的 CSS（固定字符串）

```css
.text-accent-brand:has(svg path[d^="m19.6"]) {
  position: relative;
  overflow: visible;
}
.text-accent-brand:has(svg path[d^="m19.6"])::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(
    calc(-50% + var(--ca-ox, 0px)),
    calc(-50% + var(--ca-oy, 0px))
  );
  width: var(--ca-size, 120px);
  height: var(--ca-size, 120px);
  background: var(--ca-image, none) center/contain no-repeat;
  opacity: var(--ca-opacity, 1);
  display: var(--ca-display, none);
  z-index: -1;
  pointer-events: none;
  transition: opacity 0.4s ease-in-out;
}
[inert] .text-accent-brand::before,
.blur-md .text-accent-brand::before { display: none !important; }
```

`--ca-display` 默认 `none`，只有当 `apply()` 确认有可用图片才设为 `block`。

## popup（配置面板）

### popup.html 结构

- 顶部条：标题 "Claude Loading Art" + 右侧启用 toggle
- 卡片 1 — **背景图**
  - 当前选中图预览（缩略图，96×96，圆角）
  - 缩略图网格（已上传的图，点击切换；右上角小 ✕ 删除）
  - 上传按钮（`<input type="file" accept="image/*" multiple>`）
- 卡片 2 — **位置与样式**
  - 大小滑块 32–320 px
  - 透明度滑块 0–100
  - X 偏移滑块 -200 – 200
  - Y 偏移滑块 -200 – 200
- 卡片 3 — **图标颜色**
  - `<input type="color">` + 文本输入
  - "恢复默认"按钮（清空 svgColor）

### popup.ts 行为

- 启动时读 sync + local，渲染 UI
- 所有控件 `input` 事件即时写 `chrome.storage.sync.set`
- 上传：FileReader 读为 dataURL，生成 id，追加到 `uploadedImages`，写 local，并把 `selectedImage` 设为新 id
- 删除：从 `uploadedImages` 移除；若被删的是当前选中，则把 `selectedImage` 设为剩余第一张或空
- 不需要消息通信，content.ts 通过 `storage.onChanged` 自动响应

### popup.css 风格

- CSS 变量定义浅色和深色调色板（`prefers-color-scheme`）
- 圆角 12–16px、`box-shadow` 轻
- 主色用 Claude 的橙棕色（`#c97757` 系），背景与文字参考 claude.ai
- 滑块自定义样式（`-webkit-slider-thumb`）
- 整体宽度 320–360 px

popup 使用 frontend-design skill 生成，确保审美质量。

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "Claude Loading Art",
  "version": "0.1.0",
  "description": "Decorate Claude.ai's sparkle icon with your own background art.",
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  "action": {
    "default_popup": "src/popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png" }
  },
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": ["https://claude.ai/*"],
      "js": ["dist/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

## 构建

- `tsconfig.json`：`target: ES2020`、`module: ES2020`、`outDir: dist`、`rootDir: src`、`strict: true`、`lib: ["ES2020", "DOM"]`、`types: ["chrome"]`
- `package.json` 含 `@types/chrome` 和 `typescript`，脚本 `build: tsc`、`watch: tsc -w`
- popup.html 引用 `../dist/popup.js`，popup.css 同目录引用

## 数据流

```
popup UI ──input──> chrome.storage.sync/local
                          │
                          │ onChanged
                          ▼
                     content.ts
                          │
                          ├─ :root CSS variables ──> ::before 重绘
                          └─ applyColor() ──> .text-accent-brand style.color
```

## 错误处理

- 上传超过 ~5MB 的图片：提示用户文件过大（local 存储有限额）
- chrome.storage 失败：fallback 到 DEFAULT_CONFIG 并 console.warn
- content.ts 在非 claude.ai 页面不会运行（manifest 限制），无需检查

## 测试

手动测试清单：
- 加载扩展，访问 claude.ai，初始无图时插件无视觉影响
- popup 上传 1 张图 → 主页 sparkle 图标后方出现
- 调整大小/透明度/偏移 → 实时变化
- 上传第二张并切换 → 切换生效
- 删除当前图 → 自动切到下一张或隐藏
- 修改图标颜色 → sparkle 图标变色，恢复默认还原
- 关闭启用开关 → 图与颜色覆盖均消失
- 跨页面导航（claude.ai 内 SPA 路由）→ 新出现的 sparkle 仍生效（依赖 :has + MutationObserver）
