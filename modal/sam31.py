"""
SAM 3.1 on a Modal GPU (modal/PLAN.md).

Runs Meta's own `sam3` code with the gated `facebook/sam3.1` checkpoint, which scales to zero when idle. Routes and
security live in dt_gateway/, so they are tested without a GPU.

    modal run sam31.py::download_weights    copy the checkpoint from Hugging Face to the volume
    modal run sam31.py::inspect_weights     confirm the checkpoint holds the image detector
    modal deploy sam31.py                   publish https://<workspace>--deck-twin-sam31.modal.run

`setup.sh` runs all three.
"""
import os
import threading

import modal

APP_NAME = "deck-twin-sam31"
VOLUME = "/weights"
REPO = "facebook/sam3.1"
CHECKPOINT = "sam3.1_multiplex.pt"
WEIGHTS_DIR = f"{VOLUME}/sam3.1"
WEIGHTS = f"{WEIGHTS_DIR}/{CHECKPOINT}"
# the commit this was tested on; the sam3 repo has no version tags for 3.1
SAM3_COMMIT = "f1647e8d0c"

app = modal.App(APP_NAME)
volume = modal.Volume.from_name("deck-twin-sam31", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.10.0", "torchvision", index_url="https://download.pytorch.org/whl/cu128")
    .pip_install(
        f"git+https://github.com/facebookresearch/sam3.git@{SAM3_COMMIT}",
        "einops",
        "psutil",
        "pycocotools",
        "opencv-python-headless",
        "pillow",
        "httpx",
        "fastapi[standard]",
    )
    .add_local_python_source("dt_gateway")
)


@app.function(image=image, volumes={VOLUME: volume}, secrets=[modal.Secret.from_name("huggingface-secret")], timeout=60 * 30)
def download_weights():
    """Idempotent. Uses the token in the huggingface-secret Modal secret; it is never read locally."""
    from huggingface_hub import hf_hub_download

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if not token:
        raise RuntimeError("huggingface-secret has no HF_TOKEN")
    for name in (CHECKPOINT, "config.json"):
        path = hf_hub_download(repo_id=REPO, filename=name, local_dir=WEIGHTS_DIR, token=token)
        print(f"{name}: {os.path.getsize(path) / 1e9:.2f} GB")
    volume.commit()


@app.function(image=image, volumes={VOLUME: volume}, timeout=60 * 10, memory=16384)
def inspect_weights():
    """Counts checkpoint keys by top-level module. The image model loads the `detector` ones."""
    from collections import Counter

    import torch

    ckpt = torch.load(WEIGHTS, map_location="cpu", weights_only=True)
    if "model" in ckpt and isinstance(ckpt["model"], dict):
        ckpt = ckpt["model"]
    counts = Counter(key.split(".", 1)[0] for key in ckpt)
    print(dict(counts))
    if not counts.get("detector"):
        raise RuntimeError("no detector keys in the checkpoint: the image model would load nothing")
    return dict(counts)


@app.cls(
    image=image,
    gpu="A10G",
    volumes={VOLUME: volume},
    secrets=[modal.Secret.from_name("deck-twin-gateway")],
    scaledown_window=300,
    max_containers=2,
    timeout=300,
)
@modal.concurrent(max_inputs=4)
class Sam31:
    @modal.enter()
    def load(self):
        from sam3.model_builder import build_sam3_image_model

        if not os.path.exists(WEIGHTS):
            raise RuntimeError(f"{WEIGHTS} is missing: run download_weights first")
        self.model = build_sam3_image_model(checkpoint_path=WEIGHTS, load_from_HF=False)
        # one image at a time on the GPU; concurrency only keeps /health answering
        self.lock = threading.Lock()

    def segment(self, image_bytes: bytes, prompts: list[str], threshold: float, return_masks: bool) -> dict:
        import io

        import cv2
        import numpy as np
        import torch
        from dt_gateway.meta_sam import normalise_box
        from PIL import Image
        from sam3.model.sam3_image_processor import Sam3Processor

        picture = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = picture.size
        detections = []

        def polygons(mask) -> list:
            contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            found = []
            for c in sorted(contours, key=cv2.contourArea, reverse=True)[:3]:
                points = cv2.approxPolyDP(c, 0.003 * cv2.arcLength(c, True), True).reshape(-1, 2)
                found.append([[round(float(x) / w, 4), round(float(y) / h, 4)] for x, y in points])
            return found

        with self.lock, torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
            processor = Sam3Processor(self.model, confidence_threshold=threshold)
            state = processor.set_image(picture)
            for prompt in prompts:
                processor.reset_all_prompts(state)
                out = processor.set_text_prompt(state=state, prompt=prompt)
                boxes = out["boxes"].float().cpu().numpy()
                scores = out["scores"].float().cpu().numpy()
                masks = out["masks"].cpu().numpy() if return_masks else None
                for i, (box, score) in enumerate(zip(boxes, scores)):
                    found = {"label": prompt, "box": normalise_box(*box.tolist(), w, h), "score": round(float(score), 4)}
                    if masks is not None:
                        found["polygons"] = polygons(masks[i].squeeze())
                    detections.append(found)

        return {"model": "sam-3.1", "image": {"w": w, "h": h}, "detections": detections}

    @modal.asgi_app(label=APP_NAME)
    def web(self):
        from dt_gateway.sam_api import create_sam_app

        return create_sam_app(self.segment, os.environ["DECK_TWIN_API_KEY"])
