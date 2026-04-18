import os
import base64
import mimetypes
import urllib.request
from io import BytesIO

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
IMAGE_MAX_SIZE = (720, 960)


def clean_text(value):
    if not value:
        return None
    text = str(value).strip()
    return text or None


def image_payload(content, mime_type):
    if not content:
        return {}
    return {
        "image_base64": base64.b64encode(content).decode("ascii"),
        "image_mime_type": mime_type or "image/jpeg",
    }


def extract_epub_metadata(filepath):
    try:
        import ebooklib
        from ebooklib import epub

        book = epub.read_epub(filepath)
        metadata = {}

        titles = book.get_metadata("DC", "title")
        creators = book.get_metadata("DC", "creator")
        title = clean_text(titles[0][0]) if titles else None
        author = clean_text(creators[0][0]) if creators else None

        if title:
            metadata["title"] = title
        if author:
            metadata["author"] = author

        cover_item = None
        for _, attrs in book.get_metadata("OPF", "cover"):
            cover_id = attrs.get("content")
            if cover_id:
                cover_item = book.get_item_with_id(cover_id)
                break

        if cover_item is None:
            for item in book.get_items():
                item_name = item.get_name().lower()
                item_id = item.get_id().lower()
                if item.get_type() == ebooklib.ITEM_IMAGE and (
                    "cover" in item_name or "cover" in item_id
                ):
                    cover_item = item
                    break

        if cover_item is not None:
            mime_type = (
                getattr(cover_item, "media_type", None)
                or mimetypes.guess_type(cover_item.get_name())[0]
                or "image/jpeg"
            )
            metadata.update(image_payload(cover_item.get_content(), mime_type))

        return metadata
    except Exception:
        return {}


def extract_pdf_title(filepath):
    try:
        from pypdf import PdfReader

        reader = PdfReader(filepath)
        return clean_text(reader.metadata.title if reader.metadata else None)
    except Exception:
        return None


def extract_pdf_image(filepath):
    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(filepath)
        if len(pdf) == 0:
            return {}

        page = pdf[0]
        bitmap = page.render(scale=1.8)
        image = bitmap.to_pil().convert("RGB")
        image.thumbnail(IMAGE_MAX_SIZE)

        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=82, optimize=True)
        return image_payload(buffer.getvalue(), "image/jpeg")
    except Exception:
        return {}


def extract_pdf_metadata(filepath):
    metadata = {}
    title = extract_pdf_title(filepath)
    if title:
        metadata["title"] = title
    metadata.update(extract_pdf_image(filepath))
    return metadata


def extract_document_metadata(filepath, file_type):
    if file_type == "epub":
        return extract_epub_metadata(filepath)
    if file_type == "pdf":
        return extract_pdf_metadata(filepath)
    return {}


def handler(event):
    document_id = event["input"].get("document_id")
    try:
        file_url = event["input"]["file_url"]
        file_type = event["input"].get("file_type", "pdf")

        os.makedirs("/tmp/in", exist_ok=True)
        filepath = f"/tmp/in/doc.{file_type}"

        urllib.request.urlretrieve(file_url, filepath)

        metadata = extract_document_metadata(filepath, file_type)

        converter = converters.get(file_type, pdf_converter)
        rendered = converter(filepath)
        markdown, _, _ = text_from_rendered(rendered)

        if os.path.exists(filepath):
            os.remove(filepath)

        if not markdown or not markdown.strip():
            return {"document_id": document_id, "error": "Marker produced no markdown output"}

        return {"markdown": markdown, "document_id": document_id, **metadata}
    except Exception as e:
        # Always include document_id so the webhook can route failures
        return {"document_id": document_id, "error": str(e)}


runpod.serverless.start({"handler": handler})
