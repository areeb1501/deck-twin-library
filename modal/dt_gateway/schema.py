"""
Request bodies of the SAM endpoint, and the image check they share (modal/PLAN.md).

There is no image_url field on purpose: the endpoint never fetches a URL it was handed, so it can't be pointed at
internal addresses.
"""
from __future__ import annotations

import base64
import binascii
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, StringConstraints

from .meta_sam import sniff_image

Prompt = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class SegmentRequest(BaseModel):
    image_base64: str = Field(..., description="JPEG or PNG. A data: URL is accepted.")
    prompts: list[Prompt] = Field(..., min_length=1, max_length=8, description="One noun phrase per concept")
    threshold: float = Field(0.3, ge=0, le=1)
    return_masks: bool = Field(False, description="Add normalised mask polygons")


class Person(BaseModel):
    """Where the twin's worn tags say a worker is in this frame."""

    workerId: str = Field(..., max_length=40)
    box: list[float] = Field(..., min_length=4, max_length=4)
    zone: Literal[0, 1, 2, "safe", None] = None
    permit: bool = False


class PpeRequest(BaseModel):
    image_base64: str
    camera: Optional[str] = Field(None, max_length=40)
    zone: Literal[0, 1, 2, "safe", None] = None
    permit: bool = False
    threshold: float = Field(0.65, ge=0, le=1)
    people: list[Person] = Field(default_factory=list, max_length=32)
    return_masks: bool = Field(False, description="Add normalised mask polygons")


def decode_image(image_base64: str) -> bytes:
    """Raises ValueError on anything that isn't base64 of a JPEG or PNG."""
    data = image_base64.strip()
    if data.startswith("data:") and "," in data:
        data = data.split(",", 1)[1]
    try:
        image = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError("image_base64 is not valid base64") from e
    sniff_image(image)
    return image
