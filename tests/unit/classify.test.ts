import { describe, it, expect } from "vitest";
import { classifyContentType, detectLLMProvider, detectEmailMode } from "../../src/core/classify";

const noSignals = { videoCount: 0, imageCount: 0, textLength: 5000, hasPlayer: false, hasCode: false, hasArticle: false };

describe("classifyContentType", () => {
  it("YouTube → video", () => {
    expect(classifyContentType("youtube.com", "Video Title", noSignals)).toBe("video");
  });
  it("Twitch → video", () => {
    expect(classifyContentType("twitch.tv", "Stream", noSignals)).toBe("video");
  });
  it("page with player element → video", () => {
    expect(classifyContentType("example.com", "", { ...noSignals, hasPlayer: true })).toBe("video");
  });
  it("arxiv → paper", () => {
    expect(classifyContentType("arxiv.org", "Abstract", noSignals)).toBe("paper");
  });
  it("title with 'abstract' → paper", () => {
    expect(classifyContentType("example.com", "Paper Abstract: Neural Networks", noSignals)).toBe("paper");
  });
  it("Twitter → social", () => {
    expect(classifyContentType("twitter.com", "", noSignals)).toBe("social");
  });
  it("Reddit → social", () => {
    expect(classifyContentType("reddit.com", "", noSignals)).toBe("social");
  });
  it("HN → social", () => {
    expect(classifyContentType("news.ycombinator.com", "", noSignals)).toBe("social");
  });
  it("Slack → chat", () => {
    expect(classifyContentType("slack.com", "", noSignals)).toBe("chat");
  });
  it("Discord → chat", () => {
    expect(classifyContentType("discord.com", "", noSignals)).toBe("chat");
  });
  it("Gmail → email", () => {
    expect(classifyContentType("mail.google.com", "", noSignals)).toBe("email");
  });
  it("GitHub → code", () => {
    expect(classifyContentType("github.com", "", noSignals)).toBe("code");
  });
  it("page with code blocks → code", () => {
    expect(classifyContentType("example.com", "", { ...noSignals, hasCode: true })).toBe("code");
  });
  it("Amazon → shopping", () => {
    expect(classifyContentType("amazon.com", "", noSignals)).toBe("shopping");
  });
  it("CNN → news", () => {
    expect(classifyContentType("cnn.com", "", noSignals)).toBe("news");
  });
  it("page with article tag → news", () => {
    expect(classifyContentType("example.com", "", { ...noSignals, hasArticle: true })).toBe("news");
  });
  it("many images + little text → image", () => {
    expect(classifyContentType("example.com", "", { ...noSignals, imageCount: 20, textLength: 500 })).toBe("image");
  });
  it("default → text", () => {
    expect(classifyContentType("example.com", "Some page", noSignals)).toBe("text");
  });
});

describe("detectLLMProvider", () => {
  it("detects ChatGPT", () => {
    expect(detectLLMProvider("chat.openai.com")).toBe("chatgpt");
    expect(detectLLMProvider("chatgpt.com")).toBe("chatgpt");
  });
  it("detects Claude", () => {
    expect(detectLLMProvider("claude.ai")).toBe("claude");
  });
  it("detects Gemini", () => {
    expect(detectLLMProvider("gemini.google.com")).toBe("gemini");
  });
  it("detects Perplexity", () => {
    expect(detectLLMProvider("perplexity.ai")).toBe("perplexity");
  });
  it("detects Copilot", () => {
    expect(detectLLMProvider("copilot.microsoft.com")).toBe("copilot");
  });
  it("detects Phind", () => {
    expect(detectLLMProvider("phind.com")).toBe("phind");
  });
  it("detects Cohere", () => {
    expect(detectLLMProvider("coral.cohere.com")).toBe("cohere");
  });
  it("returns null for non-LLM site", () => {
    expect(detectLLMProvider("github.com")).toBeNull();
    expect(detectLLMProvider("google.com")).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(detectLLMProvider("")).toBeNull();
  });
});

describe("detectEmailMode", () => {
  it("detects Gmail inbox", () => {
    const result = detectEmailMode("mail.google.com", "https://mail.google.com/mail/u/0/#inbox", "Inbox (3) - Gmail");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("inbox");
    expect(result!.count).toBe(3);
  });
  it("detects compose mode", () => {
    const result = detectEmailMode("mail.google.com", "https://mail.google.com/mail/u/0/#compose", "Gmail");
    expect(result!.mode).toBe("composing");
  });
  it("detects search mode", () => {
    // Gmail search uses ?q= in URL
    const result = detectEmailMode("mail.google.com", "https://mail.google.com/mail/u/0/?q=meeting", "Gmail");
    expect(result!.mode).toBe("searching");
  });
  it("detects reading mode", () => {
    const result = detectEmailMode("mail.google.com", "https://mail.google.com/mail/u/0/#inbox/123abc", "Re: Meeting - Gmail");
    expect(result!.mode).toBe("reading");
  });
  it("detects Outlook", () => {
    const result = detectEmailMode("outlook.live.com", "https://outlook.live.com/mail/", "Outlook");
    expect(result).not.toBeNull();
  });
  it("returns null for non-email site", () => {
    expect(detectEmailMode("github.com", "https://github.com", "GitHub")).toBeNull();
  });
  it("extracts unread count from title", () => {
    const result = detectEmailMode("mail.google.com", "https://mail.google.com/mail/", "Inbox (42) - Gmail");
    expect(result!.count).toBe(42);
  });
  it("returns 0 count when no parenthetical number", () => {
    const result = detectEmailMode("mail.google.com", "https://mail.google.com/mail/", "Gmail");
    expect(result!.count).toBe(0);
  });
});
