# 戌無营造的剃刀 Web

这是桌面版“戌無营造的剃刀 1.0”的网页版本，保留批量图片裁剪、PNG 水印、预览拖动、尺寸比例、格式导出等核心流程。

所有图片处理都在浏览器本机完成，不会上传原图。

## 快速调色

每张图片独立保存调色开关、色相、饱和度、亮度、对比度、清晰度、纹理，以及 LUT 和强度。前四项以 50% 为中性值；清晰度和纹理从 0 开始，范围为 0–100。关闭调色不改变原图颜色。导出先调色再叠加水印。

支持 2 至 65 阶、20 MB 以内的 3D `.cube` LUT，不支持 1D 或混合 LUT。LUT 使用 [Three.js LUTCubeLoader](https://threejs.org/docs/pages/LUTCubeLoader.html) 解析，采用三线性插值和文件的输入范围。基础调整在 sRGB 中进行，之后应用 LUT。适用于普通 sRGB 图片；Log 素材需要与输入色彩空间匹配的 LUT。

预览使用最长边 1000 像素的副本，后台线程处理；导出按所选输出尺寸处理。图片、LUT 及逐图调色参数仅保留在当前页面会话中，刷新后需重新导入。

调色计算测试（Node.js 22.18+）：`npm run test:color`。

## 实况照片

在「实况照片」中启用当前图片，可选缓慢放大、缓慢缩小、左右轻移、轻微摇晃，固定 3 秒 / 30 fps。「应用到全部」复制当前实况开关及动画；播放按钮预览当前效果。「导出实况照片」仅导出已启用的图片，普通图片导出不受影响。

导出保留裁剪、调色、LUT 和水印；水印固定在画面上，照片轻微运动。实况最长边为 1920 像素，不放大低分辨率原图。封面对应动画 1.5 秒处。编码使用 WebCodecs H.264，浏览器缺少编码器时会明确报错；推荐桌面 Chrome/Edge 或 Windows 安装版。

每张实况输出同名 JPG 和 MOV，包含匹配的 Apple 标识和 timed still-image-time 轨。没有选择目录时下载 ZIP，取消批量任务仍保留并下载已经完成的配对。桌面目录和 ZIP 中的同名文件使用相同编号；浏览器直接写入目录时添加配对的唯一后缀，避免多个标签页同时保存造成覆盖。命名均不含下划线。

使用路径：解压 ZIP，同时选择同名 JPG 和 MOV 一起导入 Mac「照片」，确认 LIVE 标识，再从「照片」隔空投送到 iPhone。不要只导入 JPG，也不要将两种文件分开导入。QQ、微信和普通文件分享不保证保留实况。本功能不提供锁屏壁纸专用兼容性。

所有计算仍在本机完成。`npm test` 执行计算、元数据与配对保存测试。`scripts/live-photo-native.swift check PHOTO.jpg VIDEO.mov` 在 macOS 用 Photos 框架验证配对，不向照片图库写入内容。真实 iPhone AirDrop 仍需设备端确认。

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
