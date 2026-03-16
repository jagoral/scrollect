import Markdown from "react-markdown";

import { env } from "@scrollect/env/web";

export default function LegalPageLayout({ content }: { content: string }) {
  const rendered = content
    .replaceAll("{{SITE_URL}}", env.VITE_SITE_URL)
    .replaceAll("{{CONTACT_EMAIL}}", env.VITE_CONTACT_EMAIL);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <Markdown>{rendered}</Markdown>
      </article>
    </div>
  );
}
