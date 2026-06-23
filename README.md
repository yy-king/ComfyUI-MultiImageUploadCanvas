# ComfyUI 多图上传画布组件

用于“qwen-image-edit2511”多图上传画布的自定义节点包。

- 包含一个可见的画布组件，带有上传按钮和缩略图预览区。
- 支持上传 1 到 3 张图片。
- 上传第 4 张图片时，会替换掉第 3 张图片。
- 缩略图上显示序号标记（1/2/3）。
- 鼠标悬停在缩略图上时，可点击 `x` 删除该图片。
- 拖拽缩略图可调整输出顺序。
- 输出项：`image1`、`image2`、`image3`。
- `image1` 为必填项。
- 允许拖拽调整图片顺序。
- 若可选输出项为空，则返回与 `image1` 尺寸一致的黑色占位图，以确保后续工作流能正常运行。

<img width="2559" height="1203" alt="img_v3_0212m_21df24f8-4298-4442-b9d8-f3e9905f3afg" src="https://github.com/user-attachments/assets/45bcd753-80b0-4d9c-8da0-ad30ec9c9e08" />
<img width="2558" height="1277" alt="img_v3_0212m_1e1dfa87-9532-4028-86d6-89b1d56912eg" src="https://github.com/user-attachments/assets/b7250de2-eb0c-41ab-977a-e24e850fa225" />
<img width="2508" height="1302" alt="img_v3_0212m_10610ff1-9bde-4582-9317-d660cd981adg" src="https://github.com/user-attachments/assets/419b95bb-73d6-40d8-89e3-d705c277cef4" />
