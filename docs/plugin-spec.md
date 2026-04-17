# Claude Loading Art — 插件需求说明书

## 功能概述

Chrome 扩展（Manifest V3），在 `https://claude.ai/*` 页面的 sparkle 图标后方显示装饰性背景图片。

## 目标 SVG 特征

Claude 的 sparkle 图标是一个 SVG，其第一个 `<path>` 的 `d` 属性以 `m19.6` 开头。该 SVG 位于 `div.text-accent-brand` 容器内。

页面上可能同时存在多个匹配的 SVG（首页问候、加载动画、输入框装饰等），需要排除以下情况：
- `[inert]` 祖先内的 SVG
- `.blur-md` 祖先内的 SVG

## 核心技术方案：CSS 伪元素 + CSS 变量

### 为什么选择这个方案

| 问题 | 为什么解决 |
|------|-----------|
| React 重渲染破坏注入的 DOM | 不操作 DOM，只注入 `<style>` |
| getBoundingClientRect 受 transform 影响 | 不计算位置，伪元素自动跟随父容器 |
| scale 动画导致位置漂移 | 伪元素跟父容器一起缩放 |
| z-index 层级问题 | `z-index: -1` 天然在父容器内容下方 |

### 实现方式

1. **content.js** 注入一个 `<style>` 标签到页面
2. CSS 使用 `:has()` 选择器匹配目标容器，用 `::before` 伪元素作为背景
3. 所有可配置项通过 CSS 变量（`--ca-*`）控制
4. content.js 从 `chrome.storage` 读取配置，设置 CSS 变量到 `:root`

### CSS 选择器

```css
/* 基础选择器 — 匹配包含 sparkle SVG 的容器 */
.text-accent-brand:has(svg path[d^="m19.6"])

/* 排除不可见的 */
:not([inert] .text-accent-brand):not(.blur-md .text-accent-brand)
```

### CSS 变量

| 变量 | 含义 | 默认值 |
|------|------|--------|
| `--ca-image` | 背景图 `url(...)` | 内置猫咪 SVG |
| `--ca-size` | 背景大小 | `120px` |
| `--ca-opacity` | 透明度 | `1` |
| `--ca-ox` | X 偏移 | `0px` |
| `--ca-oy` | Y 偏移 | `0px` |
| `--ca-display` | 是否显示 (`block`/`none`) | `block` |

### 伪元素样式

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
  transform: translate(calc(-50% + var(--ca-ox, 0px)), calc(-50% + var(--ca-oy, 0px)));
  width: var(--ca-size, 120px);
  height: var(--ca-size, 120px);
  background: var(--ca-image) center/contain no-repeat;
  opacity: var(--ca-opacity, 1);
  z-index: -1;
  pointer-events: none;
  display: var(--ca-display, block);
  transition: opacity 0.4s ease-in-out;
}
```

## 显示模式

### 直接显示 (always)

伪元素始终可见，纯 CSS 实现。

### 悬停显示 (hover)

纯 CSS 实现：

```css
/* 默认隐藏 */
.text-accent-brand:has(svg path[d^="m19.6"])::before {
  opacity: 0;
}
/* 悬停时显示 */
.text-accent-brand:has(svg path[d^="m19.6"]):hover::before {
  opacity: var(--ca-opacity, 1);
}
```

### 点击显示 (click)

需要最少量的 JS：点击时给目标容器添加/移除一个 data 属性 `data-ca-active`，CSS 根据该属性控制显示。

```css
/* 默认隐藏 */
.text-accent-brand:has(svg path[d^="m19.6"])::before {
  opacity: 0;
}
/* 激活时显示 */
.text-accent-brand[data-ca-active]:has(svg path[d^="m19.6"])::before {
  opacity: var(--ca-opacity, 1);
}
```

JS 只需：
```javascript
document.addEventListener("click", (e) => {
  const target = e.target.closest(".text-accent-brand");
  if (!target || !target.querySelector("svg path[d^='m19.6']")) return;
  target.toggleAttribute("data-ca-active");
});
```

## 图标颜色修改

唯一需要直接操作 DOM 的功能。content.js 通过 `document.querySelectorAll` 找到 `.text-accent-brand` 和 `[class*='text-brand']` 元素，设置 `el.style.color`。每次 storage 变化时重新应用。

## 配置存储

### chrome.storage.sync — `claudeLoadingArt`

```json
{
  "displayMode": "always",
  "selectedImage": "cat-sitting",
  "bgSize": 120,
  "bgOpacity": 100,
  "offsetX": 0,
  "offsetY": 0,
  "svgColor": "",
  "enabled": true
}
```

### chrome.storage.local — `uploadedImages`

```json
[
  { "id": "upload_xxx", "dataUrl": "data:image/...", "name": "filename.png" }
]
```

## content.js 职责（约 60-80 行）

1. **注入 `<style>` 标签** — 包含上述 CSS 规则
2. **读取配置** — 从 chrome.storage.sync 和 chrome.storage.local
3. **设置 CSS 变量** — `document.documentElement.style.setProperty("--ca-*", value)`
4. **监听 storage 变化** — `chrome.storage.onChanged.addListener` 更新 CSS 变量
5. **图标颜色** — 找到目标元素设置 `style.color`（需要 MutationObserver 处理新增元素）
6. **click 模式** — 一个全局 click 事件监听器
7. **防重复实例** — `window.__claude_loading_art__` 实例守卫
8. **根据 displayMode 切换 CSS 规则** — 注入不同的 CSS 规则集

## popup 保持不变

popup.html 和 popup.js 不需要修改。配置格式完全一致。

## 文件清单

| 文件 | 改动 |
|------|------|
| `manifest.json` | 不变 |
| `content.js` | 重写（约 60-80 行） |
| `styles.css` | 可为空或删除（CSS 由 JS 动态注入） |
| `popup.html` | 不变 |
| `popup.js` | 不变 |
| `icons/*` | 不变 |

## 内置背景图

5 个内置 SVG 插画（data URL 格式）：

- `person-back` — 背对的人
- `cat-sitting` — 坐着的猫
- `cat-curled` — 蜷缩的猫
- `person-standing` — 站立的人
- `person-window` — 窗边的人
