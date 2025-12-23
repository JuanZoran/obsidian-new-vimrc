# Vimrc Support for Obsidian

为 Obsidian 提供完整的 vimrc 配置文件支持，让你可以使用熟悉的 Vim 配置方式自定义键位映射。

## 功能特性

- 📁 自动检测并加载 `.obsidian.vimrc` 或 `.vimrc` 文件
- ⌨️ 支持所有标准映射命令（map, nmap, imap, vmap 及 noremap 系列）
- 🔗 与 Obsidian 命令面板深度集成
- 🔄 文件修改后自动重载配置
- 🛠️ 提供设置界面配置插件行为
- 🐛 详细的错误提示和调试模式
- 🧩 内置 Surround 操作（sa/sd/sr）

## 快速开始

### 1. 安装插件

1. 打开 Obsidian 设置 → 第三方插件
2. 关闭安全模式
3. 点击"浏览"并搜索 "Vimrc Support"
4. 安装并启用插件

### 2. 创建配置文件

在你的 vault 根目录创建 `.obsidian.vimrc` 文件：

```vim
" 设置 leader 键为空格
let mapleader = " "

" 使用 jk 退出插入模式
imap jk <Esc>

" 快速保存
nmap <leader>w :w<CR>
```

### 3. 开始使用

保存文件后，插件会自动加载配置。你可以在设置中启用"显示加载通知"来确认配置已加载。

## 插件集成（开发者）

如果你需要让第三方插件提供自定义 motion（如 Flash 跳转），请参考 `new-vimrc/docs/API.md`。
该 API 支持 `defineAsyncMotion`/`mapAsyncMotion`，可在异步交互完成后稳定执行 operator（d/c/y 等）。

## 内置 Surround

默认映射（Normal/Visual）：

| 功能 | 映射 | 说明 |
|------|------|------|
| Add  | `sa` | Normal 模式：`sa` + motion；Visual 模式：选区后 `sa` |
| Delete | `sd` | 删除光标所在行内最近的包裹 |
| Replace | `sr` | 替换光标所在行内最近的包裹 |

支持的包裹字符：`()`, `[]`, `{}`, `<>`，以及任意单字符（左右相同）。
删除/替换当前为行内匹配的简化实现，暂不支持 tag/function 等高级规则。
为避免 CodeMirror 内置 `s` 命令抢占，插件会暂时移除 Normal/Visual 的 `s` 映射，并在卸载时恢复。

## 支持的命令

### 键位映射命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `map` | 所有模式下的递归映射 | `map j gj` |
| `nmap` | 普通模式递归映射 | `nmap <leader>w :w<CR>` |
| `imap` | 插入模式递归映射 | `imap jk <Esc>` |
| `vmap` | 可视模式递归映射 | `vmap < <gv` |
| `omap` | 操作符等待模式递归映射 | `omap iw <Plug>(yourTextObject)` |
| `noremap` | 所有模式下的非递归映射 | `noremap j gj` |
| `nnoremap` | 普通模式非递归映射 | `nnoremap <C-d> <C-d>zz` |
| `inoremap` | 插入模式非递归映射 | `inoremap <C-c> <Esc>` |
| `vnoremap` | 可视模式非递归映射 | `vnoremap > >gv` |
| `onoremap` | 操作符等待模式非递归映射 | `onoremap iw <Plug>(yourTextObject)` |

### 取消映射命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `unmap` | 取消所有模式的映射 | `unmap j` |
| `nunmap` | 取消普通模式映射 | `nunmap <leader>w` |
| `iunmap` | 取消插入模式映射 | `iunmap jk` |
| `vunmap` | 取消可视模式映射 | `vunmap <` |

### Obsidian 命令集成

| 命令 | 说明 | 示例 |
|------|------|------|
| `exmap` | 定义命令别名 | `exmap save obcommand editor:save-file` |
| `obcommand` | 直接执行 Obsidian 命令 | `obcommand app:go-back` |
| `obmap` | 所有模式映射到 Obsidian 命令 | `obmap <leader>p app:quick-switcher` |
| `nobmap` | 普通模式映射到 Obsidian 命令 | `nobmap gf editor:follow-link` |
| `iobmap` | 插入模式映射到 Obsidian 命令 | `iobmap <C-s> editor:save-file` |
| `vobmap` | 可视模式映射到 Obsidian 命令 | `vobmap <leader>c editor:toggle-comment` |

### 变量设置

| 命令 | 说明 | 示例 |
|------|------|------|
| `let mapleader` | 设置 leader 键 | `let mapleader = " "` |

### 注释

以 `"` 开头的行会被忽略：

```vim
" 这是一条注释
nmap j gj  " 这是行尾注释
```

## 特殊键

支持以下特殊键符号：

| 符号 | 说明 |
|------|------|
| `<CR>` / `<Enter>` | 回车键 |
| `<Esc>` | Escape 键 |
| `<Space>` | 空格键 |
| `<Tab>` | Tab 键 |
| `<BS>` / `<Backspace>` | 退格键 |
| `<Del>` / `<Delete>` | 删除键 |
| `<Up>` / `<Down>` / `<Left>` / `<Right>` | 方向键 |
| `<Home>` / `<End>` | Home/End 键 |
| `<PageUp>` / `<PageDown>` | 翻页键 |
| `<C-x>` | Ctrl + x（x 为任意字母） |
| `<leader>` | Leader 键（默认为 `\`） |


## 示例配置

以下是一个完整的示例 `.obsidian.vimrc` 配置：

```vim
" ============================================
" Obsidian Vimrc 配置示例
" ============================================

" 设置 leader 键为空格
let mapleader = " "

" ============================================
" 基本导航
" ============================================

" 使用 j/k 在换行时按视觉行移动
nmap j gj
nmap k gk

" 快速移动半页并居中
nnoremap <C-d> <C-d>zz
nnoremap <C-u> <C-u>zz

" ============================================
" 快速退出插入模式
" ============================================

imap jk <Esc>
imap kj <Esc>

" ============================================
" 文件操作
" ============================================

" 快速保存
nmap <leader>w :w<CR>

" ============================================
" Obsidian 命令集成
" ============================================

" 跟随链接
exmap followLink obcommand editor:follow-link
nmap gf :followLink<CR>

" 导航历史
exmap back obcommand app:go-back
exmap forward obcommand app:go-forward
nmap <C-o> :back<CR>
nmap <C-i> :forward<CR>

" 快速切换文件
nobmap <leader>p app:quick-switcher

" 命令面板
nobmap <leader><leader> command-palette:open

" 切换侧边栏
nobmap <leader>e app:toggle-left-sidebar

" 搜索
nobmap <leader>f global-search:open

" 创建新笔记
nobmap <leader>n file-explorer:new-file

" ============================================
" 可视模式增强
" ============================================

" 缩进后保持选中
vmap < <gv
vmap > >gv

" ============================================
" 窗口管理
" ============================================

" 分割窗口
exmap splitVertical obcommand workspace:split-vertical
exmap splitHorizontal obcommand workspace:split-horizontal
nmap <leader>sv :splitVertical<CR>
nmap <leader>sh :splitHorizontal<CR>

" 关闭当前窗格
exmap closePane obcommand workspace:close
nmap <leader>q :closePane<CR>
```

## 查找 Obsidian 命令 ID

要找到 Obsidian 命令的 ID：

1. 打开 Obsidian 设置 → 快捷键
2. 搜索你想要的命令
3. 命令 ID 显示在命令名称下方（灰色小字）

或者使用开发者控制台：

1. 按 `Ctrl+Shift+I`（Windows/Linux）或 `Cmd+Option+I`（Mac）打开开发者工具
2. 在控制台输入：`app.commands.commands`
3. 展开对象查看所有可用命令及其 ID

## 插件设置

在 Obsidian 设置 → 第三方插件 → Vimrc Support 中可以配置：

| 设置 | 说明 | 默认值 |
|------|------|--------|
| Vimrc 文件路径 | 配置文件的相对路径 | `.obsidian.vimrc` |
| 显示加载通知 | 加载配置时显示通知 | 关闭 |
| 调试模式 | 在控制台输出详细日志 | 关闭 |

## 故障排除

### 配置没有生效

1. 确认文件名正确：`.obsidian.vimrc`（注意开头的点）
2. 确认文件位于 vault 根目录
3. 尝试在设置中点击"重新加载 vimrc"按钮
4. 启用调试模式查看控制台输出

### 显示"命令未找到"警告

这表示 `obcommand` 或 `exmap` 中使用的命令 ID 不存在。请检查：

1. 命令 ID 是否拼写正确
2. 相关插件是否已安装并启用
3. 使用上述方法查找正确的命令 ID

### 映射不工作

1. 检查是否有语法错误（查看控制台）
2. 确认使用了正确的模式命令（nmap 用于普通模式，imap 用于插入模式等）
3. 检查是否与其他映射冲突
4. 尝试使用 `noremap` 系列命令避免递归问题

### 特殊键不工作

1. 确认使用了正确的语法（如 `<CR>` 而不是 `<cr>`）
2. 某些键组合可能被系统或 Obsidian 占用
3. 尝试使用不同的键组合

### 查看调试信息

1. 在插件设置中启用"调试模式"
2. 按 `Ctrl+Shift+I` 打开开发者工具
3. 查看 Console 标签页中以 `[Vimrc]` 开头的日志

## 与其他 Vim 插件的兼容性

本插件基于 Obsidian 内置的 Vim 模式（CodeMirror Vim），与以下插件兼容：

- Obsidian 原生 Vim 模式
- 其他不修改 Vim 核心功能的插件

如果遇到兼容性问题，请尝试：

1. 禁用其他 Vim 相关插件
2. 检查是否有映射冲突
3. 在 GitHub 上报告问题

## 限制

- 仅支持桌面端（Windows、macOS、Linux）
- 不支持所有 Vim 命令（如 `:set` 选项）
- 某些复杂的 Vim 脚本语法不受支持

## 反馈与贡献

如果你遇到问题或有功能建议，欢迎：

- 在 GitHub 上提交 Issue
- 提交 Pull Request

## 许可证

MIT License
