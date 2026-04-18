FROM nvidia/cuda:12.8.1-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages \
    "ebooklib" \
    "marker-pdf[full]" \
    "pypdf" \
    "pypdfium2" \
    "runpod" \
    "torch" \
    "torchvision" \
    --extra-index-url https://download.pytorch.org/whl/cu128

# Pre-download model weights at build time so they're baked into the image
RUN python3 -c "from marker.models import create_model_dict; create_model_dict()"

COPY handler.py /handler.py

CMD ["python3", "/handler.py"]
