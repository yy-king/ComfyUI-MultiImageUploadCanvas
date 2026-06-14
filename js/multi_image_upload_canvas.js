import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_ID = "MIUC_TripleImageUpload";
const DOM_WIDGET = "MIUC_CANVAS";
const MAX_IMAGES = 3;
const MIN_NODE_WIDTH = 360;
const WIDGET_HEIGHT = 172;
const ACTIVE_COLOR = "#4aa8ff";
const INACTIVE_COLOR = "#50545f";
const BLOCKED_IMAGE_TYPE = "MIUC_BLOCKED_IMAGE";

const TEXT_UPLOAD = "\u4e0a\u4f20\u56fe\u7247";
const TEXT_UPLOADING = "\u4e0a\u4f20\u4e2d...";
const TEXT_DELETE = "\u5220\u9664\u56fe\u7247";
const TEXT_UPLOAD_FAILED = "\u56fe\u7247\u4e0a\u4f20\u5931\u8d25";
const TEXT_PREVIEW_CLOSE = "\u5173\u95ed\u9884\u89c8";

function safe(fn, fallback = undefined) {
    try {
        return fn();
    } catch (error) {
        console.error("[MIUC]", error);
        return fallback;
    }
}

function parseValue(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === "string") return item.trim();
                if (item && typeof item === "object") return String(item.path || item.name || "").trim();
                return "";
            })
            .filter(Boolean)
            .slice(0, MAX_IMAGES);
    }

    if (typeof value !== "string") return [];

    try {
        return parseValue(JSON.parse(value));
    } catch {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }
}

function serialize(paths) {
    return JSON.stringify(parseValue(paths));
}

function apiURL(route) {
    return api?.apiURL ? api.apiURL(route) : route;
}

function parseAnnotatedPath(path) {
    const match = String(path || "").match(/\s+\[(input|output|temp)\]$/i);
    const type = match ? match[1].toLowerCase() : "input";
    const clean = (match ? path.slice(0, match.index) : String(path || "")).replace(/\\/g, "/");
    const slash = clean.lastIndexOf("/");
    return {
        filename: slash >= 0 ? clean.slice(slash + 1) : clean,
        subfolder: slash >= 0 ? clean.slice(0, slash) : "",
        type,
    };
}

function viewURL(path) {
    const item = parseAnnotatedPath(path);
    const params = new URLSearchParams();
    params.set("filename", item.filename);
    params.set("subfolder", item.subfolder);
    params.set("type", item.type);
    params.set("rand", String(Math.random()));
    return apiURL("/view?" + params.toString());
}

function setDirty(node) {
    safe(() => node.setDirtyCanvas(true, true));
    safe(() => node.graph.setDirtyCanvas(true, true));
    safe(() => app.graph.setDirtyCanvas(true, true));
    safe(() => app.canvas.setDirty(true, true));
    safe(() => app.canvas.setDirtyCanvas(true, true));
}

function ensureNodeSize(node) {
    node.size = node.size || [MIN_NODE_WIDTH, 230];
    node.size[0] = Math.max(node.size[0] || 0, MIN_NODE_WIDTH);
    node.size[1] = Math.max(node.size[1] || 0, 220);
}

function ensureBlockedSlotColor() {
    safe(() => {
        globalThis.LGraphCanvas = globalThis.LGraphCanvas || {};
        globalThis.LGraphCanvas.link_type_colors = globalThis.LGraphCanvas.link_type_colors || {};
        globalThis.LGraphCanvas.link_type_colors[BLOCKED_IMAGE_TYPE] = INACTIVE_COLOR;
    });
    safe(() => {
        const canvas = app?.canvas;
        if (!canvas) return;
        canvas.default_connection_color_byType = canvas.default_connection_color_byType || {};
        canvas.default_connection_color_byTypeOff = canvas.default_connection_color_byTypeOff || {};
        canvas.default_connection_color_byType[BLOCKED_IMAGE_TYPE] = INACTIVE_COLOR;
        canvas.default_connection_color_byTypeOff[BLOCKED_IMAGE_TYPE] = INACTIVE_COLOR;
    });
    safe(() => {
        document.documentElement.style.setProperty(`--color-datatype-${BLOCKED_IMAGE_TYPE}`, INACTIVE_COLOR);
        document.documentElement.style.setProperty(`--color-datatype-${BLOCKED_IMAGE_TYPE.toUpperCase()}`, INACTIVE_COLOR);
    });
}

function getOutputType(output) {
    const type = output?._miucOriginalType || output?.type || "IMAGE";
    return type === "MIUC_DISABLED_IMAGE" || type === "MIUC_HIDDEN_VALUE" || type === BLOCKED_IMAGE_TYPE ? "IMAGE" : type;
}

function getGraphLink(graph, id) {
    const links = graph?._links || graph?.links || app?.graph?._links || app?.graph?.links;
    if (!links) return null;
    if (typeof links.get === "function") return links.get(id);
    return links[id] || null;
}

function getGraphNode(graph, id) {
    if (id === undefined || id === null) return null;
    if (typeof graph?.getNodeById === "function") return graph.getNodeById(id);
    return graph?._nodes_by_id?.[id] || app?.graph?._nodes_by_id?.[id] || null;
}

function getLinkTargetNode(graph, linkId) {
    const link = getGraphLink(graph, linkId);
    if (!link) return null;
    const targetId = link.target_id ?? link.targetId ?? link.to_id ?? link.toId;
    return getGraphNode(graph, targetId);
}

function getLinkSourceNode(graph, linkId) {
    const link = getGraphLink(graph, linkId);
    if (!link) return null;
    const sourceId = link.origin_id ?? link.originId ?? link.source_id ?? link.sourceId ?? link.from_id ?? link.fromId;
    return getGraphNode(graph, sourceId);
}

function getLinkSourceSlotIndex(graph, linkId) {
    const link = getGraphLink(graph, linkId);
    if (!link) return -1;
    return link.origin_slot ?? link.originSlot ?? link.source_slot ?? link.sourceSlot ?? link.from_slot ?? link.fromSlot ?? -1;
}

function isPreviewImageNode(node) {
    const type = String(node?.comfyClass || node?.type || "");
    return type === "PreviewImage";
}

function clearPreviewNodeState(node) {
    if (!node) return;

    for (const key of ["imgs", "images", "animatedImages", "imageRects", "preview", "imageIndex", "overIndex"]) {
        if (key in node) {
            if (Array.isArray(node[key])) node[key] = [];
            else node[key] = null;
        }
    }

    node.__miucPreviewCleared = true;
    setDirty(node);
}

function getPreviewBlockedSource(node) {
    const input = node?.inputs?.[0];
    const linkId = input?.link;
    if (linkId === undefined || linkId === null) return null;

    const sourceNode = getLinkSourceNode(node.graph, linkId);
    if (!sourceNode || (sourceNode.comfyClass !== NODE_ID && sourceNode.type !== NODE_ID)) return null;

    const sourceSlotIndex = getLinkSourceSlotIndex(node.graph, linkId);
    if (sourceSlotIndex < 0) return null;

    const output = sourceNode.outputs?.[sourceSlotIndex];
    if (!output?.miuc_blocked) return null;

    return { sourceNode, sourceSlotIndex, output };
}

function refreshPreviewBlockedState(node) {
    const blockedSource = getPreviewBlockedSource(node);
    if (blockedSource) {
        node.__miucBlockedInput = true;
        clearPreviewNodeState(node);
        return true;
    }

    node.__miucBlockedInput = false;
    return false;
}

function syncBlockedDownstreamPreviews(node) {
    if (!node?.outputs) return;

    for (const output of node.outputs) {
        for (const linkId of output.links || []) {
            const targetNode = getLinkTargetNode(node.graph, linkId);
            if (!isPreviewImageNode(targetNode)) continue;

            if (output.miuc_blocked) {
                targetNode.__miucBlockedInput = true;
                clearPreviewNodeState(targetNode);
            } else {
                targetNode.__miucBlockedInput = false;
                targetNode.__miucPreviewCleared = false;
            }
        }
    }
}

function syncOutputLinkColors(node) {
    if (!node.outputs) return;

    for (const output of node.outputs) {
        for (const linkId of output.links || []) {
            const link = getGraphLink(node.graph, linkId);
            if (!link) continue;

            if (link._miucOriginalColor === undefined) {
                link._miucOriginalColor = link.color ?? null;
            }

            if (output.miuc_blocked) {
                link.miuc_blocked = true;
                link.color = INACTIVE_COLOR;
            } else if (link.miuc_blocked) {
                link.miuc_blocked = false;
                link.color = link._miucOriginalColor;
            }
        }
    }
}

function updateOutputSlots(node, count) {
    if (!node.outputs) return;

    ensureBlockedSlotColor();

    node.outputs.forEach((output, index) => {
        const active = index === 0 || index < count;
        const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
        const type = getOutputType(output);
        output._miucOriginalType = type;
        output.disabled = false;
        output.miuc_has_data = active;
        output.miuc_blocked = !active;
        output.type = type;
        output.label = output.name;
        output.color = color;
        output.color_on = color;
        output.color_off = color;
        output.bgcolor = color;

        const concrete = node._concreteOutputs?.[index];
        if (concrete) {
            concrete._miucOriginalType = type;
            concrete.miuc_blocked = !active;
            concrete.color = color;
            concrete.color_on = color;
            concrete.color_off = color;
            concrete.bgcolor = color;
        }
    });

    syncOutputLinkColors(node);
    syncBlockedDownstreamPreviews(node);
}

function drawBlockedOutputSlotsLocal(node, ctx) {
    if (!node.outputs?.length || node.flags?.collapsed || typeof node.getConnectionPos !== "function") return;

    const slotPos = new Float32Array(2);
    ctx.save();
    for (let index = 1; index < node.outputs.length; index++) {
        const output = node.outputs[index];
        if (!output?.miuc_blocked) continue;

        const pos = node.getConnectionPos(false, index, slotPos);
        if (!pos) continue;

        const x = pos[0] - node.pos[0];
        const y = pos[1] - node.pos[1];
        ctx.beginPath();
        ctx.fillStyle = INACTIVE_COLOR;
        ctx.strokeStyle = "#282b32";
        ctx.lineWidth = 1.5;
        ctx.arc(x, y, 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

function drawBlockedOutputSlotsGlobal(node, ctx) {
    if (!node.outputs?.length || node.flags?.collapsed || typeof node.getConnectionPos !== "function") return;

    const slotPos = new Float32Array(2);
    ctx.save();
    for (let index = 1; index < node.outputs.length; index++) {
        const output = node.outputs[index];
        if (!output?.miuc_blocked) continue;

        const pos = node.getConnectionPos(false, index, slotPos);
        if (!pos) continue;

        ctx.beginPath();
        ctx.fillStyle = INACTIVE_COLOR;
        ctx.strokeStyle = "#282b32";
        ctx.lineWidth = 1.5;
        ctx.arc(pos[0], pos[1], 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

function normalizeConnectionType(type) {
    return type === BLOCKED_IMAGE_TYPE ? "IMAGE" : type;
}

function patchCanvasRenderLink() {
    const canvas = app?.canvas;
    if (!canvas || canvas.__miucRenderLinkPatched || typeof canvas.renderLink !== "function") return;

    canvas.__miucRenderLinkPatched = true;
    const renderLink = canvas.renderLink;
    canvas.renderLink = function (ctx, start, end, link, skipBorder, flow, color, startDir, endDir, options) {
        const linkColor = color ?? link?.color;
        return renderLink.call(this, ctx, start, end, link, skipBorder, flow, linkColor, startDir, endDir, options);
    };
}

function patchCanvasForeground() {
    const canvas = app?.canvas;
    if (!canvas || canvas.__miucForegroundPatched) return;

    canvas.__miucForegroundPatched = true;
    const onDrawForeground = canvas.onDrawForeground;
    canvas.onDrawForeground = function (ctx) {
        const result = onDrawForeground ? onDrawForeground.apply(this, arguments) : undefined;
        safe(() => {
            const nodes = this.visible_nodes || this.graph?._nodes || app.graph?._nodes || [];
            for (const node of nodes) {
                if (node?.comfyClass === NODE_ID || node?.type === NODE_ID) {
                    drawBlockedOutputSlotsGlobal(node, ctx);
                }
            }
        });
        return result;
    };
}

function getSourceWidget(node) {
    return node.widgets?.find((widget) => widget?.name === "images");
}

function hideSourceWidget(widget) {
    if (!widget || widget.__miucHidden) return;
    widget.__miucHidden = true;
    widget.__miucOriginalComputeSize = widget.computeSize;
    widget.__miucOriginalType = widget.type;
    widget.hidden = true;
    widget.type = "MIUC_HIDDEN_VALUE";
    widget.options = widget.options || {};
    widget.options.hidden = true;
    widget.options.serialize = true;
    widget.computeSize = () => [0, -4];
    widget.computeLayoutSize = () => ({
        minHeight: 0,
        minWidth: 0,
        maxHeight: 0,
        maxWidth: 0,
    });

    for (const key of ["inputEl", "element", "el", "domElement"]) {
        const element = widget[key];
        if (element?.style) {
            element.hidden = true;
            element.style.display = "none";
            element.style.visibility = "hidden";
            element.style.pointerEvents = "none";
        }
    }
}

function syncSourceValue(node, sourceWidget, paths, notify = true) {
    const value = serialize(paths);

    if (sourceWidget) {
        sourceWidget.value = value;
        sourceWidget.serializeValue = () => value;
    }

    node.widgets_values = node.widgets_values || [];
    if (Array.isArray(node.widgets) && sourceWidget) {
        const index = node.widgets.indexOf(sourceWidget);
        if (index >= 0) node.widgets_values[index] = value;
    }

    node.properties = node.properties || {};
    node.properties.miuc_images = value;

    if (notify) {
        safe(() => sourceWidget?.callback?.(value));
        safe(() => node.onWidgetChanged?.("images", value, undefined, sourceWidget));
        safe(() => node.graph.change());
    }

    setDirty(node);
}

async function uploadOne(file) {
    const body = new FormData();
    body.append("image", file, file.name);
    body.append("type", "input");

    const response = await api.fetchApi("/upload/image", { method: "POST", body });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const data = await response.json();
    return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

function appendUploaded(paths, uploaded) {
    const next = parseValue(paths);
    for (const path of uploaded) {
        if (next.length < MAX_IMAGES) next.push(path);
        else next[MAX_IMAGES - 1] = path;
    }
    return next;
}

function focusCanvas() {
    safe(() => app?.canvas?.canvas?.focus?.());
    safe(() => app?.canvas?.canvas?.ownerDocument?.activeElement?.blur?.());
    safe(() => app?.canvas?.canvas?.focus?.());
}

function ensureImagePreviewModal() {
    ensureStyle();

    let overlay = document.getElementById("miuc-image-preview-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "miuc-image-preview-overlay";
    overlay.className = "miuc-image-preview-overlay";
    overlay.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "miuc-image-preview-dialog";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "miuc-image-preview-close";
    closeButton.title = TEXT_PREVIEW_CLOSE;
    closeButton.textContent = "x";

    const image = document.createElement("img");
    image.className = "miuc-image-preview-image";
    image.alt = "preview";

    const closePreview = () => {
        overlay.hidden = true;
        image.removeAttribute("src");
        document.removeEventListener("keydown", overlay.__miucEscHandler, true);
        focusCanvas();
    };

    overlay.__miucClose = closePreview;
    overlay.__miucImage = image;
    overlay.__miucEscHandler = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        closePreview();
    };

    closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePreview();
    });

    overlay.addEventListener("click", (event) => {
        if (event.target !== overlay) return;
        closePreview();
    });

    dialog.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    dialog.append(closeButton, image);
    overlay.append(dialog);
    document.body.appendChild(overlay);
    return overlay;
}

function openImagePreview(path) {
    const overlay = ensureImagePreviewModal();
    const image = overlay.__miucImage;
    if (!image) return;

    image.src = viewURL(path);
    overlay.hidden = false;
    document.addEventListener("keydown", overlay.__miucEscHandler, true);
}

function ensureStyle() {
    if (document.getElementById("miuc-dom-style")) return;

    const style = document.createElement("style");
    style.id = "miuc-dom-style";
    style.textContent = `
.miuc-dom-widget {
    box-sizing: border-box;
    width: 100%;
    height: ${WIDGET_HEIGHT}px;
    padding: 4px 16px 0;
    color: #f5f6f8;
    font: 13px/1.3 Inter, Arial, sans-serif;
    pointer-events: auto;
    user-select: none;
}
.miuc-dom-widget * {
    box-sizing: border-box;
}
.miuc-upload-button {
    width: 100%;
    height: 32px;
    border: 1.5px solid #626673;
    border-radius: 5px;
    background: #2e2f34;
    color: #f5f6f8;
    font-weight: 700;
    cursor: pointer;
}
.miuc-upload-button:disabled {
    cursor: wait;
    opacity: 0.72;
}
.miuc-preview {
    height: 104px;
    margin-top: 18px;
    padding: 0 14px;
    border: 1.5px solid #505561;
    border-radius: 7px;
    background: #17181d;
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
}
.miuc-preview.miuc-drag-over {
    border-color: #f5f7fb;
}
.miuc-thumb {
    position: relative;
    flex: 0 0 74px;
    width: 74px;
    height: 74px;
    border: 2px solid ${ACTIVE_COLOR};
    border-radius: 8px;
    overflow: hidden;
    background: #20232a;
    cursor: grab;
}
.miuc-thumb:active {
    cursor: grabbing;
}
.miuc-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
}
.miuc-badge {
    position: absolute;
    left: 6px;
    top: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #f6f7f9;
    color: #20242a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 12px;
    pointer-events: none;
}
.miuc-delete {
    position: absolute;
    right: 4px;
    top: 4px;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 50%;
    background: rgba(12, 13, 16, 0.9);
    color: #fff;
    font-weight: 800;
    line-height: 18px;
    padding: 0;
    opacity: 0;
    cursor: pointer;
}
.miuc-thumb:hover .miuc-delete {
    opacity: 1;
}
.miuc-image-preview-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(8, 9, 12, 0.88);
    padding: 24px;
}
.miuc-image-preview-overlay[hidden] {
    display: none;
}
.miuc-image-preview-dialog {
    position: relative;
    max-width: min(92vw, 1800px);
    max-height: 92vh;
    padding: 20px;
    border: 1px solid #515666;
    border-radius: 12px;
    background: #14161b;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.miuc-image-preview-image {
    display: block;
    max-width: min(88vw, 1760px);
    max-height: calc(92vh - 40px);
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    background: #0f1116;
}
.miuc-image-preview-close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 30px;
    height: 30px;
    border: 1px solid #666d7c;
    border-radius: 999px;
    background: rgba(16, 18, 24, 0.92);
    color: #f4f6fa;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
}
`;
    document.head.appendChild(style);
}

function makeDomUploadWidget(node, sourceWidget) {
    if (typeof node.addDOMWidget !== "function") return null;

    ensureStyle();

    const state = {
        paths: parseValue(sourceWidget?.value ?? node.properties?.miuc_images ?? "[]"),
        uploading: false,
        dragIndex: -1,
        dragging: false,
    };

    const root = document.createElement("div");
    root.className = "miuc-dom-widget";

    const button = document.createElement("button");
    button.className = "miuc-upload-button";
    button.type = "button";
    button.textContent = TEXT_UPLOAD;

    const preview = document.createElement("div");
    preview.className = "miuc-preview";

    root.append(button, preview);

    function setPaths(paths, notify = true) {
        state.paths = parseValue(paths);
        syncSourceValue(node, sourceWidget, state.paths, notify);
        updateOutputSlots(node, state.paths.length);
        render();
    }

    function render() {
        preview.textContent = "";

        state.paths.forEach((path, index) => {
            const tile = document.createElement("div");
            tile.className = "miuc-thumb";
            tile.draggable = true;

            const img = document.createElement("img");
            img.alt = `image${index + 1}`;
            img.src = viewURL(path);

            const badge = document.createElement("div");
            badge.className = "miuc-badge";
            badge.textContent = String(index + 1);

            const del = document.createElement("button");
            del.className = "miuc-delete";
            del.type = "button";
            del.title = TEXT_DELETE;
            del.textContent = "x";

            del.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const next = state.paths.slice();
                next.splice(index, 1);
                setPaths(next);
            });

            tile.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (state.dragging) return;
                openImagePreview(path);
            });

            tile.addEventListener("dragstart", (event) => {
                state.dragging = true;
                state.dragIndex = index;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(index));
                event.stopPropagation();
            });

            tile.addEventListener("dragover", (event) => {
                if (state.dragIndex >= 0) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                }
            });

            tile.addEventListener("drop", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const from = state.dragIndex;
                state.dragIndex = -1;
                if (from < 0 || from === index) return;
                const next = state.paths.slice();
                const [item] = next.splice(from, 1);
                next.splice(index, 0, item);
                setPaths(next);
            });

            tile.addEventListener("dragend", () => {
                state.dragIndex = -1;
                preview.classList.remove("miuc-drag-over");
                setTimeout(() => {
                    state.dragging = false;
                }, 0);
            });

            tile.append(img, badge, del);
            preview.append(tile);
        });
    }

    function openPicker() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.multiple = true;
        input.style.display = "none";
        document.body.appendChild(input);
        input.addEventListener("change", async () => {
            await uploadFiles(input.files);
            input.remove();
        }, { once: true });
        input.click();
    }

    async function uploadFiles(files) {
        const imageFiles = Array.from(files || []).filter((file) => file?.type?.startsWith("image/"));
        if (!imageFiles.length || state.uploading) return;

        state.uploading = true;
        button.disabled = true;
        button.textContent = TEXT_UPLOADING;
        setDirty(node);

        try {
            const uploaded = [];
            for (const file of imageFiles) {
                uploaded.push(await uploadOne(file));
            }
            setPaths(appendUploaded(state.paths, uploaded));
        } catch (error) {
            console.error("[MIUC] upload failed", error);
            alert(`${TEXT_UPLOAD_FAILED}: ${error.message || error}`);
        } finally {
            state.uploading = false;
            button.disabled = false;
            button.textContent = TEXT_UPLOAD;
            setDirty(node);
        }
    }

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPicker();
    });

    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("dblclick", (event) => event.stopPropagation());

    preview.addEventListener("dragover", (event) => {
        const hasFiles = Array.from(event.dataTransfer?.types || []).includes("Files");
        if (hasFiles || state.dragIndex >= 0) {
            event.preventDefault();
            event.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
            preview.classList.add("miuc-drag-over");
        }
    });

    preview.addEventListener("dragleave", () => {
        preview.classList.remove("miuc-drag-over");
    });

    preview.addEventListener("drop", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        preview.classList.remove("miuc-drag-over");
        if (event.dataTransfer?.files?.length) await uploadFiles(event.dataTransfer.files);
    });

    const widget = node.addDOMWidget("miuc_canvas", DOM_WIDGET, root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => WIDGET_HEIGHT,
        getMaxHeight: () => WIDGET_HEIGHT,
        getValue: () => "",
        setValue: () => {},
    });

    widget.serialize = false;
    widget.miuc = true;
    widget.setPaths = setPaths;
    setPaths(state.paths, false);
    return widget;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
    } else {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
    }
    ctx.closePath();
}

function addCanvasFallbackWidget(node, sourceWidget) {
    if (typeof node.addCustomWidget !== "function") return null;

    const widget = {
        name: "miuc_canvas",
        type: DOM_WIDGET,
        serialize: false,
        miuc: true,
        paths: parseValue(sourceWidget?.value ?? "[]"),
        images: [],
        layout: null,
        hovering: -1,
        uploading: false,

        computeSize(width) {
            return [Math.max(width || MIN_NODE_WIDTH, MIN_NODE_WIDTH), WIDGET_HEIGHT];
        },
        setPaths(paths, notify = true) {
            this.paths = parseValue(paths);
            this.images = this.paths.map((path) => {
                const image = new Image();
                image.onload = () => setDirty(node);
                image.onerror = () => setDirty(node);
                image.src = viewURL(path);
                return image;
            });
            syncSourceValue(node, sourceWidget, this.paths, notify);
            updateOutputSlots(node, this.paths.length);
        },
        draw(ctx, _node, width, y) {
            const margin = 16;
            const button = { x: margin, y: y + 4, w: Math.max(80, width - margin * 2), h: 32 };
            const preview = { x: margin, y: y + 54, w: Math.max(80, width - margin * 2), h: 104 };
            const size = 74;
            const items = [0, 1, 2].map((i) => ({ x: preview.x + 14 + i * 84, y: preview.y + 15, w: size, h: size }));
            this.layout = { button, preview, items };

            updateOutputSlots(node, this.paths.length);
            ctx.save();
            roundRect(ctx, button.x, button.y, button.w, button.h, 5);
            ctx.fillStyle = this.uploading ? "#383c46" : "#2e2f34";
            ctx.fill();
            ctx.strokeStyle = "#626673";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = "#f5f6f8";
            ctx.font = "bold 15px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(this.uploading ? TEXT_UPLOADING : TEXT_UPLOAD, button.x + button.w / 2, button.y + button.h / 2);

            roundRect(ctx, preview.x, preview.y, preview.w, preview.h, 7);
            ctx.fillStyle = "#17181d";
            ctx.fill();
            ctx.strokeStyle = "#505561";
            ctx.stroke();

            this.paths.forEach((path, index) => {
                const rect = items[index];
                const image = this.images[index];
                ctx.save();
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
                ctx.clip();
                if (image?.complete && image.naturalWidth) {
                    const scale = Math.max(rect.w / image.naturalWidth, rect.h / image.naturalHeight);
                    const sw = rect.w / scale;
                    const sh = rect.h / scale;
                    ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, rect.x, rect.y, rect.w, rect.h);
                } else {
                    ctx.fillStyle = "#20232a";
                    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
                }
                ctx.restore();
                ctx.strokeStyle = ACTIVE_COLOR;
                ctx.lineWidth = 2;
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
                ctx.stroke();
                ctx.fillStyle = "#f6f7f9";
                ctx.beginPath();
                ctx.arc(rect.x + 14, rect.y + 14, 11, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#20242a";
                ctx.font = "bold 12px sans-serif";
                ctx.fillText(String(index + 1), rect.x + 14, rect.y + 14);
            });

            ctx.restore();
        },
        mouse(event, pos) {
            if (!this.layout || !Array.isArray(pos)) return false;
            const { button, items } = this.layout;
            if (event.type === "pointerdown" || event.type === "mousedown") {
                if (pos[0] >= button.x && pos[0] <= button.x + button.w && pos[1] >= button.y && pos[1] <= button.y + button.h) {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.multiple = true;
                    input.style.display = "none";
                    document.body.appendChild(input);
                    input.addEventListener("change", async () => {
                        const files = Array.from(input.files || []).filter((file) => file?.type?.startsWith("image/"));
                        if (!files.length || this.uploading) return;
                        this.uploading = true;
                        setDirty(node);
                        try {
                            const uploaded = [];
                            for (const file of files) uploaded.push(await uploadOne(file));
                            this.setPaths(appendUploaded(this.paths, uploaded));
                        } finally {
                            this.uploading = false;
                            input.remove();
                            setDirty(node);
                        }
                    }, { once: true });
                    input.click();
                    return true;
                }

                for (let index = 0; index < this.paths.length; index++) {
                    const rect = items[index];
                    if (!rect) continue;
                    if (pos[0] >= rect.x && pos[0] <= rect.x + rect.w && pos[1] >= rect.y && pos[1] <= rect.y + rect.h) {
                        openImagePreview(this.paths[index]);
                        return true;
                    }
                }
            }
            return false;
        },
    };

    widget.setPaths(widget.paths, false);
    node.addCustomWidget(widget);
    return widget;
}

function installUploadUI(node) {
    if (!node || node.__miucInstalled) return;
    if (node.comfyClass !== NODE_ID && node.type !== NODE_ID) return;

    const sourceWidget = getSourceWidget(node);
    if (!sourceWidget) return;

    node.__miucInstalled = true;
    node.serialize_widgets = true;
    ensureNodeSize(node);
    hideSourceWidget(sourceWidget);

    const value = node.properties?.miuc_images ?? sourceWidget.value ?? "[]";
    sourceWidget.value = serialize(parseValue(value));

    let uiWidget = safe(() => makeDomUploadWidget(node, sourceWidget), null);
    if (!uiWidget) uiWidget = safe(() => addCanvasFallbackWidget(node, sourceWidget), null);

    updateOutputSlots(node, parseValue(sourceWidget.value).length);
    setDirty(node);
}

function refreshUploadUI(node) {
    if (!node || (node.comfyClass !== NODE_ID && node.type !== NODE_ID)) return;

    const sourceWidget = getSourceWidget(node);
    if (!sourceWidget) return;

    hideSourceWidget(sourceWidget);
    updateOutputSlots(node, parseValue(sourceWidget.value ?? node.properties?.miuc_images ?? "[]").length);

    const uiWidget = node.widgets?.find((widget) => widget?.miuc);
    if (uiWidget?.setPaths) uiWidget.setPaths(parseValue(sourceWidget.value ?? node.properties?.miuc_images ?? "[]"), false);
}

app.registerExtension({
    name: "MIUC.MultiImageUploadCanvas",

    setup() {
        safe(() => ensureBlockedSlotColor());
        safe(() => patchCanvasRenderLink());
        safe(() => patchCanvasForeground());
    },

    nodeCreated(node) {
        safe(() => ensureBlockedSlotColor());
        safe(() => patchCanvasRenderLink());
        safe(() => patchCanvasForeground());
        safe(() => installUploadUI(node));
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name === NODE_ID) {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                safe(() => installUploadUI(this));
                return result;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                safe(() => {
                    installUploadUI(this);
                    refreshUploadUI(this);
                });
                return result;
            };

            const drawSlots = nodeType.prototype.drawSlots;
            nodeType.prototype.drawSlots = function () {
                const changed = [];
                for (let index = 0; index < (this._concreteOutputs?.length || 0); index++) {
                    const slot = this._concreteOutputs[index];
                    const source = this.outputs?.[index];
                    if (!slot || !source?.miuc_blocked) continue;
                    changed.push([slot, slot.type, slot.color_on, slot.color_off]);
                    slot.type = BLOCKED_IMAGE_TYPE;
                    slot.color_on = INACTIVE_COLOR;
                    slot.color_off = INACTIVE_COLOR;
                }
                try {
                    return drawSlots ? drawSlots.apply(this, arguments) : undefined;
                } finally {
                    for (const [slot, type, colorOn, colorOff] of changed) {
                        slot.type = type;
                        slot.color_on = colorOn;
                        slot.color_off = colorOff;
                    }
                }
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function () {
                const result = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                safe(() => {
                    updateOutputSlots(this, parseValue(getSourceWidget(this)?.value ?? this.properties?.miuc_images ?? "[]").length);
                    setDirty(this);
                });
                return result;
            };

            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function (ctx) {
                const result = onDrawForeground ? onDrawForeground.apply(this, arguments) : undefined;
                safe(() => drawBlockedOutputSlotsLocal(this, ctx));
                return result;
            };
            return;
        }

        if (nodeData?.name !== "PreviewImage") return;

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function () {
            const result = onExecuted ? onExecuted.apply(this, arguments) : undefined;
            safe(() => refreshPreviewBlockedState(this));
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
            safe(() => refreshPreviewBlockedState(this));
            return result;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
            safe(() => refreshPreviewBlockedState(this));
            return result;
        };

        const onDrawBackground = nodeType.prototype.onDrawBackground;
        nodeType.prototype.onDrawBackground = function () {
            safe(() => refreshPreviewBlockedState(this));
            return onDrawBackground ? onDrawBackground.apply(this, arguments) : undefined;
        };
    },
});
