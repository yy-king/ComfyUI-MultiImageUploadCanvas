# ComfyUI Multi Image Upload Canvas Rebuild

Custom node package for the screenshot-style multi-image upload canvas.

- One visible canvas widget with an upload button and thumbnail preview area.
- Upload 1-3 images.
- A 4th upload replaces image 3.
- Thumbnails show order badges 1/2/3.
- Hover a thumbnail to delete it with `x`.
- Drag thumbnails to reorder outputs.
- Outputs: `image1`, `image2`, `image3`.
- `image1` is required.
- Empty optional outputs return black placeholders matching `image1`, so connected workflows can keep running.
