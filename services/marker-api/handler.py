import os
import urllib.request

import runpod
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.output import text_from_rendered

# Load models once at container start - stays in GPU memory across invocations
artifact_dict = create_model_dict()
pdf_converter = PdfConverter(artifact_dict=artifact_dict)

try:
    from marker.converters.epub import EpubConverter
    epub_converter = EpubConverter(artifact_dict=artifact_dict)
except ImportError:
    epub_converter = pdf_converter

converters = {
    "pdf": pdf_converter,
    "epub": epub_converter,
}

DOWNLOAD_TIMEOUT_SECONDS = 120


def handler(event):
    document_id = event["input"].get("document_id")
    try:
        file_url = event["input"]["file_url"]
        file_type = event["input"].get("file_type", "pdf")

        os.makedirs("/tmp/in", exist_ok=True)
        filepath = f"/tmp/in/doc.{file_type}"

        urllib.request.urlretrieve(file_url, filepath)

        converter = converters.get(file_type, pdf_converter)
        rendered = converter(filepath)
        markdown, _, _ = text_from_rendered(rendered)

        if os.path.exists(filepath):
            os.remove(filepath)

        if not markdown or not markdown.strip():
            return {"document_id": document_id, "error": "Marker produced no markdown output"}

        return {"markdown": markdown, "document_id": document_id}
    except Exception as e:
        # Always include document_id so the webhook can route failures
        return {"document_id": document_id, "error": str(e)}


runpod.serverless.start({"handler": handler})
