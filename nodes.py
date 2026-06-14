import hashlib
import json
import os

import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence

import folder_paths
import node_helpers
import comfy.model_management

try:
    from comfy_api.latest import InputImpl
except Exception:
    InputImpl = None


NODE_ID = "MIUC_TripleImageUpload"
DISPLAY_NAME = "\u6279\u91cf\u56fe\u7247\u4e0a\u4f20\u753b\u5e03"
MAX_IMAGES = 3


def _clean_path(path):
    return path.strip() if isinstance(path, str) else ""


def _parse_images(images):
    if isinstance(images, str):
        try:
            images = json.loads(images)
        except Exception:
            images = [images] if images.strip() else []

    if not isinstance(images, list):
        return []

    paths = []
    for image in images:
        if isinstance(image, dict):
            image = image.get("path") or image.get("name") or ""
        image = _clean_path(image)
        if image:
            paths.append(image)

    return paths[:MAX_IMAGES]


def _load_with_input_impl(image_path):
    if InputImpl is None:
        return None

    components = InputImpl.VideoFromFile(image_path).get_components()
    if components.images.shape[0] <= 0:
        return None

    dtype = comfy.model_management.intermediate_dtype()
    device = comfy.model_management.intermediate_device()
    return components.images.to(device=device, dtype=dtype)


def _load_with_pillow(image_path):
    dtype = comfy.model_management.intermediate_dtype()
    device = comfy.model_management.intermediate_device()

    img = node_helpers.pillow(Image.open, image_path)
    output_images = []
    width = None
    height = None

    for frame in ImageSequence.Iterator(img):
        frame = node_helpers.pillow(ImageOps.exif_transpose, frame)
        image = frame.convert("RGB")

        if width is None or height is None:
            width, height = image.size
        elif image.size != (width, height):
            continue

        image = np.array(image).astype(np.float32) / 255.0
        image = torch.from_numpy(image)[None,]
        output_images.append(image.to(dtype=dtype))

    if not output_images:
        raise RuntimeError("Cannot read image.")

    output_image = torch.cat(output_images, dim=0)
    return output_image.to(device=device, dtype=dtype)


def _load_image(image):
    image = _clean_path(image)
    if not image:
        return None

    image_path = folder_paths.get_annotated_filepath(image)
    loaded = _load_with_input_impl(image_path)
    if loaded is not None:
        return loaded
    return _load_with_pillow(image_path)


def _make_placeholder_like(reference_image):
    if reference_image is None:
        raise RuntimeError("Please upload at least 1 image.")

    placeholder = reference_image[:1].clone()
    placeholder.zero_()
    return placeholder


class MIUCTripleImageUpload:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("STRING", {"default": "[]", "multiline": False}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("image1", "image2", "image3")
    FUNCTION = "load_images"
    CATEGORY = "image"
    DESCRIPTION = "Upload 1-3 images in one canvas. image1 is required. image2 and image3 are optional."
    SEARCH_ALIASES = ["multi image upload", "batch image upload", "triple image upload"]

    def load_images(self, images="[]"):
        paths = _parse_images(images)
        if not paths:
            raise RuntimeError("Please upload at least 1 image.")

        main_image = _load_image(paths[0])
        if main_image is None:
            raise RuntimeError("Please upload at least 1 image.")

        second_image = _load_image(paths[1]) if len(paths) > 1 else None
        third_image = _load_image(paths[2]) if len(paths) > 2 else None

        if second_image is None:
            second_image = _make_placeholder_like(main_image)
        if third_image is None:
            third_image = _make_placeholder_like(main_image)

        return (main_image, second_image, third_image)

    @classmethod
    def IS_CHANGED(cls, images="[]"):
        paths = _parse_images(images)
        if not paths:
            return "no-image"

        digest = hashlib.sha256()
        for image in paths:
            digest.update(image.encode("utf-8", errors="ignore"))
            image_path = folder_paths.get_annotated_filepath(image)
            with open(image_path, "rb") as handle:
                digest.update(handle.read())

        return digest.hexdigest()

    @classmethod
    def VALIDATE_INPUTS(cls, images="[]"):
        paths = _parse_images(images)
        if not paths:
            return "Please upload at least 1 image."

        for image in paths:
            if not folder_paths.exists_annotated_filepath(image):
                return f"Invalid image file: {image}"

        return True


NODE_CLASS_MAPPINGS = {
    NODE_ID: MIUCTripleImageUpload,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    NODE_ID: DISPLAY_NAME,
}
