# ComfyUI 多图上传画布组件

用于“截图风格”多图上传画布的自定义节点包。

- 包含一个可见的画布组件，带有上传按钮和缩略图预览区。
- 支持上传 1 到 3 张图片。
- 上传第 4 张图片时，会替换掉第 3 张图片。
- 缩略图上显示序号标记（1/2/3）。
- 鼠标悬停在缩略图上时，可点击 `x` 删除该图片。
- 拖拽缩略图可调整输出顺序。
- 输出项：`image1`、`image2`、`image3`。
- `image1` 为必填项。
- 若可选输出项为空，则返回与 `image1` 尺寸一致的黑色占位图，以确保后续工作流能正常运行。

https://github.com/yy-king/ComfyUI-MultiImageUploadCanvas/blob/main/README/ex1.jpg
https://github.com/yy-king/ComfyUI-MultiImageUploadCanvas/blob/main/README/ex2.jpg
https://github.com/yy-king/ComfyUI-MultiImageUploadCanvas/blob/main/README/ex3.jpg