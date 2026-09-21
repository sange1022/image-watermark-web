# Mac 实况助手试用版

正式版保持在 https://sange1022.github.io/image-watermark-web/ 。
试用版位于 https://sange1022.github.io/image-watermark-web/mac-preview/ 。

打开本机 `~/Applications/水印实况助手（试用）.app`，点击“打开试用网页”。
首次需要允许浏览器访问本地网络，并允许助手添加照片。
网页中启用实况，点击“发送到 Mac 照片”。保存完成会打开照片 App；
仍需在照片中选择图片，点击分享、隔空投送并选择设备。
不承诺直接分享 JPG/MOV 文件即可在接收设备识别为实况。

助手只请求添加权限，不读取或删除现有图库。
仅接收指定 GitHub Pages 来源、持有当前会话令牌的本机请求。
断开连接会使旧令牌失效。不要分享助手的连接链接。
发送失败或取消后使用“继续发送”；不要刷新网页后重新添加，网页待处理队列仅在当前页面内保留。
若助手提示上次保存结果未确认，先在照片中检查，避免手动重复发送。

返回原版：点击网页“返回正式版”并退出助手即可，无须卸载或迁移文件。
试用代码独立分支 `codex/mac-live-helper-trial`，不修改正式版根目录。

本机构建：`bash script/build_and_run.sh --build-only`。
需要 Apple Silicon、macOS 13+、命令行开发工具及匹配的 macOS SDK。
当前包为本机 ad-hoc 签名，未经公证，不作为其他电脑的正式安装包。
