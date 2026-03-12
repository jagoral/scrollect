import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, cleanupTestData, signUp } from "./helpers";

test.describe(
  "Upload page tab structure",
  {
    tag: "@fast",
    annotation: {
      type: "criteria",
      description: "P0-1: Upload page shows three tabs; Upload File is default",
    },
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("upload page renders three tabs with Upload File selected by default", async ({
      page,
    }) => {
      await page.goto("/upload");
      await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

      // All three tabs should be visible
      await expect(page.getByRole("tab", { name: /upload file/i })).toBeVisible();
      await expect(page.getByRole("tab", { name: /paste url/i })).toBeVisible();
      await expect(page.getByRole("tab", { name: /paste text/i })).toBeVisible();

      // Upload File should be selected by default
      await expect(page.getByRole("tab", { name: /upload file/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    test("switching tabs shows the correct content panel", async ({ page }) => {
      await page.goto("/upload");
      await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

      await test.step("switch to Paste URL tab", async () => {
        await page.getByRole("tab", { name: /paste url/i }).click();
        await expect(page.getByRole("tab", { name: /paste url/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await expect(page.locator('[data-testid="url-input"]')).toBeVisible();
      });

      await test.step("switch to Paste Text tab", async () => {
        await page.getByRole("tab", { name: /paste text/i }).click();
        await expect(page.getByRole("tab", { name: /paste text/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await expect(page.getByLabel(/title/i)).toBeVisible();
        await expect(page.locator('[data-testid="text-content-input"]')).toBeVisible();
      });

      await test.step("switch back to Upload File tab", async () => {
        await page.getByRole("tab", { name: /upload file/i }).click();
        await expect(page.getByRole("tab", { name: /upload file/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await expect(page.getByText(/drag & drop/i)).toBeVisible();
      });
    });
  },
);

test.describe(
  "Paste URL — happy paths",
  {
    tag: "@upload",
    annotation: [
      { type: "criteria", description: "P0-2: Article URL creates document in library" },
      { type: "criteria", description: "P0-3: YouTube URL creates document in library" },
      { type: "issue", description: "https://github.com/jagoral/scrollect/issues/42" },
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test(
      "submitting a valid article URL creates a document in the library",
      {
        annotation: { type: "criteria", description: "P0-2" },
      },
      async ({ page }) => {
        await test.step("submit article URL", async () => {
          await page.goto("/upload");
          await page.getByRole("tab", { name: /paste url/i }).click();
          await page.locator('[data-testid="url-input"]').fill("https://example.com/article");
          await page.locator('[data-testid="url-submit"]').click();
        });

        await test.step("verify success toast", async () => {
          await expect(page.getByText(/submitted for processing/i)).toBeVisible({ timeout: 30000 });
        });

        await test.step("verify document appears in library", async () => {
          await page.goto("/library");
          await expect(page.locator("a[href^='/library/']").first()).toBeVisible({
            timeout: 10000,
          });
        });
      },
    );

    test(
      "submitting a YouTube URL creates a document in the library",
      {
        annotation: { type: "criteria", description: "P0-3" },
      },
      async ({ page }) => {
        await test.step("submit YouTube URL", async () => {
          await page.goto("/upload");
          await page.getByRole("tab", { name: /paste url/i }).click();
          await page
            .locator('[data-testid="url-input"]')
            .fill("https://www.youtube.com/watch?v=P6FORpg0KVo");
          await page.locator('[data-testid="url-submit"]').click();
        });

        await test.step("verify success toast", async () => {
          await expect(page.getByText(/submitted for processing/i)).toBeVisible({
            timeout: 30000,
          });
        });

        await test.step("verify document appears in library", async () => {
          await page.goto("/library");
          await expect(page.locator("a[href^='/library/']").first()).toBeVisible({
            timeout: 10000,
          });
        });
      },
    );
  },
);

test.describe(
  "Paste URL — YouTube auto-detection",
  {
    tag: "@fast",
    annotation: {
      type: "criteria",
      description: "P0-4: YouTube badge appears for all YouTube URL formats",
    },
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    const youtubeUrls = [
      "https://www.youtube.com/watch?v=P6FORpg0KVo",
      "https://youtu.be/P6FORpg0KVo",
      "https://m.youtube.com/watch?v=P6FORpg0KVo",
      "https://www.youtube.com/shorts/P6FORpg0KVo",
    ];

    for (const url of youtubeUrls) {
      test(`YouTube URL format detected with badge: ${url}`, async ({ page }) => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste url/i }).click();

        await page.locator('[data-testid="url-input"]').fill(url);

        // Submit button should be enabled
        await expect(page.locator('[data-testid="url-submit"]')).toBeEnabled();

        // YouTube type badge should appear
        const typeBadge = page.locator('[data-testid="url-type-badge"]');
        await expect(typeBadge).toBeVisible();
        await expect(typeBadge).toContainText("YouTube");

        // No inline validation error
        await expect(page.getByText(/please enter a valid url/i)).not.toBeVisible();
      });
    }
  },
);

test.describe(
  "Paste URL — validation and errors",
  {
    tag: "@fast",
    annotation: [
      {
        type: "criteria",
        description: "P0-7: Empty/invalid URL disables submit + shows inline error",
      },
      { type: "criteria", description: "P0-8: Unreachable URL shows error toast" },
    ],
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test(
      "submit button is disabled when URL input is empty",
      {
        annotation: { type: "criteria", description: "P0-7" },
      },
      async ({ page }) => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste url/i }).click();

        await expect(page.locator('[data-testid="url-submit"]')).toBeDisabled();
      },
    );

    test(
      "typing non-URL text shows inline validation error",
      {
        annotation: { type: "criteria", description: "P0-7" },
      },
      async ({ page }) => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste url/i }).click();

        await page.locator('[data-testid="url-input"]').fill("hello world");

        await expect(page.getByText(/please enter a valid url/i)).toBeVisible({
          timeout: 5000,
        });
      },
    );

    test(
      "URL without protocol shows inline validation error",
      {
        annotation: { type: "criteria", description: "P0-7" },
      },
      async ({ page }) => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste url/i }).click();

        await page.locator('[data-testid="url-input"]').fill("example.com/article");

        await expect(page.getByText(/please enter a valid url/i)).toBeVisible({
          timeout: 5000,
        });
      },
    );

    test.fixme(
      "server-side extraction failure shows error toast and preserves URL",
      {
        annotation: [
          { type: "criteria", description: "P0-8" },
          { type: "issue", description: "https://github.com/jagoral/scrollect/issues/42" },
          {
            type: "fixme",
            description:
              "createFromUrl succeeds synchronously; extraction errors surface asynchronously. " +
              "Needs synchronous URL reachability validation or real-time error polling.",
          },
        ],
      },
      async ({ page }) => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste url/i }).click();

        const urlInput = page.locator('[data-testid="url-input"]');
        await urlInput.fill("https://this-domain-does-not-exist-99999.com/article");
        await page.locator('[data-testid="url-submit"]').click();

        await expect(page.getByText(/something went wrong/i)).toBeVisible({
          timeout: 60000,
        });

        await expect(urlInput).toBeEnabled({ timeout: 5000 });
        await expect(urlInput).toHaveValue("https://this-domain-does-not-exist-99999.com/article");
      },
    );
  },
);

test.describe(
  "Paste Text — happy path",
  {
    tag: "@upload",
    annotation: {
      type: "criteria",
      description: "P0-9: Title + text body creates a document in the library",
    },
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("submitting title and text body creates a document in the library", async ({ page }) => {
      await test.step("fill in title and text content", async () => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste text/i }).click();
        await page.getByLabel(/title/i).fill("My Test Notes");
        await page
          .locator('[data-testid="text-content-input"]')
          .fill(
            "This is some test content that should be processed into learning cards. " +
              "It contains enough text to be meaningful for chunking and embedding.",
          );
      });

      await test.step("submit and verify success toast", async () => {
        await page.locator('[data-testid="text-submit"]').click();
        await expect(page.getByText(/added/i)).toBeVisible({ timeout: 30000 });
      });

      await test.step("verify document appears in library", async () => {
        await page.goto("/library");
        await expect(page.getByText("My Test Notes")).toBeVisible({ timeout: 10000 });
      });
    });
  },
);

test.describe(
  "Paste Text — validation",
  {
    tag: "@fast",
    annotation: {
      type: "criteria",
      description: "P0-10: Submit disabled when title or body empty; inline validation on blur",
    },
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("Add to Library button is disabled when title is empty", async ({ page }) => {
      await page.goto("/upload");
      await page.getByRole("tab", { name: /paste text/i }).click();

      await page.locator('[data-testid="text-content-input"]').fill("Some text content");

      await expect(page.locator('[data-testid="text-submit"]')).toBeDisabled();
    });

    test("Add to Library button is disabled when text body is empty", async ({ page }) => {
      await page.goto("/upload");
      await page.getByRole("tab", { name: /paste text/i }).click();

      await page.getByLabel(/title/i).fill("Some Title");

      await expect(page.locator('[data-testid="text-submit"]')).toBeDisabled();
    });

    test("inline validation shows 'Title is required' on blur when title is empty", async ({
      page,
    }) => {
      await page.goto("/upload");
      await page.getByRole("tab", { name: /paste text/i }).click();

      const titleInput = page.getByLabel(/title/i);
      await titleInput.focus();
      await titleInput.blur();

      await expect(page.getByText(/title is required/i)).toBeVisible({
        timeout: 5000,
      });
    });
  },
);

test.describe(
  "Upload File regression",
  {
    tag: "@upload",
    annotation: {
      type: "criteria",
      description: "P0-12: File upload works after tab refactor; unsupported types rejected",
    },
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("file upload still works on the Upload File tab after tab refactor", async ({ page }) => {
      await page.goto("/upload");

      await expect(page.getByRole("tab", { name: /upload file/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await page
        .locator('[data-testid="file-input"]')
        .setInputFiles(path.join(FIXTURES_DIR, "test.md"));

      await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });
    });

    test("file upload rejects unsupported file types on Upload File tab", async ({ page }) => {
      await page.goto("/upload");

      await page.locator('[data-testid="file-input"]').setInputFiles({
        name: "invalid.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("This is a plain text file"),
      });

      await expect(page.getByText(/unsupported file type/i)).toBeVisible({
        timeout: 5000,
      });
    });
  },
);

test.describe(
  "Loading states during processing",
  {
    tag: "@upload",
    annotation: {
      type: "criteria",
      description: "P0-13: Spinner + disabled inputs shown during URL/text submission",
    },
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("URL tab shows spinner and disables input during processing", async ({ page }) => {
      await page.goto("/upload");
      await page.getByRole("tab", { name: /paste url/i }).click();

      const urlInput = page.locator('[data-testid="url-input"]');
      await urlInput.fill("https://example.com/article");

      await page.locator('[data-testid="url-submit"]').click();

      // Button should show "Processing..." text and input should be disabled
      await expect(page.getByText(/processing/i)).toBeVisible({ timeout: 5000 });
      await expect(urlInput).toBeDisabled();
    });

    test("Text tab shows spinner and disables fields during processing", async ({ page }) => {
      await page.goto("/upload");
      await page.getByRole("tab", { name: /paste text/i }).click();

      const titleInput = page.getByLabel(/title/i);
      const textArea = page.locator('[data-testid="text-content-input"]');

      await titleInput.fill("Test Title");
      await textArea.fill(
        "Some test content that needs to be long enough to be meaningful for the test.",
      );

      await page.locator('[data-testid="text-submit"]').click();

      // Button should show processing state and fields should be disabled
      await expect(page.locator('[data-testid="text-submit"]')).toContainText(/processing/i, {
        timeout: 5000,
      });
      await expect(titleInput).toBeDisabled();
      await expect(textArea).toBeDisabled();
    });
  },
);

test.describe(
  "Success toast with library link",
  {
    tag: "@upload",
    annotation: {
      type: "criteria",
      description: "P0-14: Success toast includes document info and library link",
    },
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("URL tab success toast contains library link", async ({ page }) => {
      await page.goto("/upload");
      await page.getByRole("tab", { name: /paste url/i }).click();

      await page.locator('[data-testid="url-input"]').fill("https://example.com/article");
      await page.locator('[data-testid="url-submit"]').click();

      const toastEl = page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /submitted for processing/i });
      await expect(toastEl).toBeVisible({ timeout: 30000 });
      await expect(toastEl.getByRole("link", { name: /library/i })).toBeVisible();
    });

    test("Text tab success toast contains entered title and library link", async ({ page }) => {
      await page.goto("/upload");
      await page.getByRole("tab", { name: /paste text/i }).click();

      await page.getByLabel(/title/i).fill("My Notes");
      await page.locator('[data-testid="text-content-input"]').fill("Some content here.");

      await page.locator('[data-testid="text-submit"]').click();

      const toastEl = page.locator("[data-sonner-toast]").filter({ hasText: /added/i });
      await expect(toastEl).toBeVisible({ timeout: 30000 });
      await expect(toastEl).toContainText("My Notes");
      await expect(toastEl.getByRole("link", { name: /library/i })).toBeVisible();
    });
  },
);

test.describe(
  "URL-based documents without storageId",
  {
    tag: "@upload",
    annotation: {
      type: "criteria",
      description: "P0-15: URL-sourced documents render in library and detail page without errors",
    },
  },
  () => {
    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("URL-sourced document can be viewed in library and detail page without errors", async ({
      page,
    }) => {
      await test.step("create a URL-based document", async () => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste url/i }).click();
        await page.locator('[data-testid="url-input"]').fill("https://example.com/article");
        await page.locator('[data-testid="url-submit"]').click();
        await expect(page.getByText(/submitted for processing/i)).toBeVisible({ timeout: 30000 });
      });

      await test.step("verify document renders in library", async () => {
        await page.goto("/library");
        const docLink = page.locator("a[href^='/library/']").first();
        await expect(docLink).toBeVisible({ timeout: 10000 });
        await docLink.click();
      });

      await test.step("verify detail page renders without errors", async () => {
        await expect(page).toHaveURL(/\/library\/.+/);
        await expect(page.getByText(/back to library/i)).toBeVisible();
        await expect(page.locator("text=Something went wrong")).not.toBeVisible();
        await expect(page.locator("text=undefined")).not.toBeVisible();
      });
    });
  },
);
