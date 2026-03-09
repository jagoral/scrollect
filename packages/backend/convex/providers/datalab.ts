import type { PdfParser, PollResult } from "./types";

export class DatalabParser implements PdfParser {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async submit(fileUrl: string): Promise<string> {
    const formData = new FormData();
    formData.append("file_url", fileUrl);
    formData.append("output_format", "markdown");
    formData.append("mode", "accurate");
    formData.append("disable_image_extraction", "true");
    formData.append("paginate", "true");

    const response = await fetch("https://www.datalab.to/api/v1/convert", {
      method: "POST",
      headers: { "X-API-Key": this.apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Datalab submit failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    if (!data.success || !data.request_check_url) {
      throw new Error(`Datalab submit failed: ${JSON.stringify(data)}`);
    }

    return data.request_check_url;
  }

  async poll(checkUrl: string): Promise<PollResult> {
    const response = await fetch(checkUrl, {
      headers: { "X-API-Key": this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Datalab poll failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "complete") {
      if (!data.success) {
        return {
          status: "error",
          errorMessage: data.error ?? "Datalab conversion failed",
        };
      }
      const markdown = data.markdown?.trim();
      if (!markdown) {
        return {
          status: "error",
          errorMessage: "No text content could be extracted from the PDF",
        };
      }
      return { status: "complete", markdown };
    }

    if (data.status === "error") {
      return {
        status: "error",
        errorMessage: data.error ?? "Datalab parsing failed",
      };
    }

    return { status: "pending" };
  }
}
