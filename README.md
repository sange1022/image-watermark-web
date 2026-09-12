# 戌無营造的剃刀 Web

这是桌面版“戌無营造的剃刀 1.0”的网页版本，保留批量图片裁剪、PNG 水印、预览拖动、尺寸比例、格式导出等核心流程。

所有图片处理都在浏览器本机完成，不会上传原图。

## 快速调色

每张图片独立保存调色开关、色相、饱和度、亮度、对比度、清晰度、纹理，以及 LUT 和强度。前四项以 50% 为中性值；清晰度和纹理从 0 开始，范围为 0–100。关闭调色不改变原图颜色。导出先调色再叠加水印。

支持 2 至 65 阶、20 MB 以内的 3D `.cube` LUT，不支持 1D 或混合 LUT。LUT 使用 [Three.js LUTCubeLoader](https://threejs.org/docs/pages/LUTCubeLoader.html) 解析，采用三线性插值和文件的输入范围。基础调整在 sRGB 中进行，之后应用 LUT。适用于普通 sRGB 图片；Log 素材需要与输入色彩空间匹配的 LUT。

预览使用最长边 1000 像素的副本，后台线程处理；导出按所选输出尺寸处理。图片、LUT 及逐图调色参数仅保留在当前页面会话中，刷新后需重新导入。

调色计算测试（Node.js 22.18+）：`npm run test:color`。

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## Windows 安装版

`npm run dist:win` 生成 Windows 10/11 x64 的 NSIS 安装包，输出到 `desktop-release/`。内置全部页面、图片处理程序和“青鱼表现0065”LUT，不依赖 GitHub Pages 或额外安装 Node.js。桌面程序支持选择输出文件夹、直接写入图片、打开保存位置，以及 ZIP 导出。

桌面调试：`npm run desktop`。桌面集成测试：`npm run test:desktop`。

GitHub Actions 的 `Windows installer` 工作流会生成安装包，在 Windows runner 上静默安装，再验证启动、LUT、调色、文件导出和防覆盖。该安装包未配置代码签名证书。
