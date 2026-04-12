import { randomUUID } from "node:crypto";
import { createGenerationStream } from "./generate.mjs";

const conversations = new Map();

/**
 * Collect all JSONL lines from a ReadableStream into an array of parsed patches.
 */
async function collectPatches(stream, signal) {
  const decoder = new TextDecoder();
  const patches = [];
  let buffer = "";

  if (Symbol.asyncIterator in stream) {
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          try {
            patches.push(JSON.parse(trimmed));
          } catch {
            // skip malformed lines
          }
        }
      }
    }
  } else {
    const reader = stream.getReader();
    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += typeof value === "string" ? value : decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            try {
              patches.push(JSON.parse(trimmed));
            } catch {
              // skip malformed lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // flush remaining buffer
  const remaining = buffer.trim();
  if (remaining.length > 0) {
    try {
      patches.push(JSON.parse(remaining));
    } catch {
      // skip malformed trailing content
    }
  }

  return patches;
}

/**
 * Apply RFC 6902 patches to build the final spec object.
 * Only handles "add" and "replace" ops with simple /key or /key/subkey paths.
 */
function applyPatches(patches) {
  const spec = {};

  for (const patch of patches) {
    if (!patch || typeof patch.path !== "string") continue;

    const segments = patch.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    if (patch.op === "add" || patch.op === "replace") {
      let target = spec;
      for (let i = 0; i < segments.length - 1; i++) {
        if (target[segments[i]] == null || typeof target[segments[i]] !== "object") {
          target[segments[i]] = {};
        }
        target = target[segments[i]];
      }
      target[segments[segments.length - 1]] = patch.value;
    } else if (patch.op === "remove") {
      let target = spec;
      for (let i = 0; i < segments.length - 1; i++) {
        if (target[segments[i]] == null) break;
        target = target[segments[i]];
      }
      delete target[segments[segments.length - 1]];
    }
  }

  return spec;
}

/**
 * Extract key-value details from a freeform message.
 * Supports Latin and Khmer (Unicode) scripts.
 * Handles both comma-delimited ("name X, title Y") and standalone patterns.
 */
function extractCardDetails(message) {
  const details = {};

  // Extract name — stops at comma or next keyword
  const nameMatch = message.match(/\bname\s*[:\-]?\s*([^,]+?)(?=\s*,|\s*$|\s+(?:title|company|email|phone|address|website)\b)/i);
  if (nameMatch) details.name = nameMatch[1].trim();

  // Extract title / role
  const titleMatch = message.match(/\btitle\s*[:\-]?\s*([^,]+?)(?=\s*,|\s*$|\s+(?:name|company|email|phone|address|website)\b)/i);
  if (titleMatch) details.title = titleMatch[1].trim();

  // Extract company
  const companyMatch = message.match(/\bcompany\s*[:\-]?\s*([^,]+?)(?=\s*,|\s*$|\s+(?:name|title|email|phone|address|website)\b)/i);
  if (companyMatch) details.company = companyMatch[1].trim();

  // Extract email
  const emailMatch = message.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (emailMatch) details.email = emailMatch[1];

  // Extract phone
  const phoneMatch = message.match(/\bphone\s*[:\-]?\s*(\+?[\d\s()-]{7,})/i);
  if (phoneMatch) details.phone = phoneMatch[1].trim();

  // Extract address
  const addrMatch = message.match(/\baddress\s*[:\-]?\s*([^,]+?)(?=\s*,|\s*$|\s+(?:name|title|company|email|phone|website)\b)/i);
  if (addrMatch) details.address = addrMatch[1].trim();

  // Extract website — only explicit URLs, not partial matches
  const webMatch = message.match(/\b((?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/\S*)?)\b/);
  if (webMatch) details.website = webMatch[1];

  return details;
}

/**
 * Detect style intent from the message.
 */
function detectStyle(message) {
  const lower = message.toLowerCase();

  if (lower.match(/\bkhmer\b/) || message.match(/[\u1780-\u17FF]/)) {
    // Khmer-inspired: deep blue & gold, evokes Angkor and Cambodian aesthetics
    return { bg: "#0c1b33", accent: "#d4a843", textPrimary: "#f5e6c8", textSecondary: "#c9b88c", cardBg: "#162447", labelColor: "#d4a843" };
  }
  if (lower.match(/\bdark\b/)) {
    return { bg: "#1a1a2e", accent: "#e94560", textPrimary: "#ffffff", textSecondary: "#a0aec0", cardBg: "#16213e", labelColor: "#e94560" };
  }
  if (lower.match(/\bminimal(ist)?\b/)) {
    return { bg: "#ffffff", accent: "#000000", textPrimary: "#111111", textSecondary: "#666666", cardBg: "#fafafa", labelColor: "#000000" };
  }
  if (lower.match(/\bcolorful|vibrant|bold\b/)) {
    return { bg: "#667eea", accent: "#f093fb", textPrimary: "#ffffff", textSecondary: "#e2e8f0", cardBg: "#764ba2", labelColor: "#f093fb" };
  }
  if (lower.match(/\belegant|luxury|premium\b/)) {
    return { bg: "#1b1b1b", accent: "#d4af37", textPrimary: "#f5f5f5", textSecondary: "#b0b0b0", cardBg: "#2d2d2d", labelColor: "#d4af37" };
  }
  // Default modern style
  return { bg: "#f7f8fc", accent: "#4f46e5", textPrimary: "#1e293b", textSecondary: "#64748b", cardBg: "#ffffff", labelColor: "#4f46e5" };
}

/**
 * Build a Sone spec for a card design from extracted details and style.
 */
function buildCardSpec(details, style) {
  const elements = {};
  const contentChildren = [];

  // Name
  if (details.name) {
    elements["name"] = {
      type: "Text",
      props: {
        segments: [{ text: details.name, style: { weight: "bold" } }],
        size: 28,
        color: style.textPrimary,
        lineHeight: 1.2,
      },
      children: [],
    };
    contentChildren.push("name");
  }

  // Title
  if (details.title) {
    elements["title"] = {
      type: "Text",
      props: {
        segments: [{ text: details.title }],
        size: 16,
        color: style.accent,
        lineHeight: 1.4,
      },
      children: [],
    };
    contentChildren.push("title");
  }

  // Company
  if (details.company) {
    elements["company"] = {
      type: "Text",
      props: {
        segments: [{ text: details.company, style: { weight: "bold" } }],
        size: 14,
        color: style.textSecondary,
        lineHeight: 1.4,
      },
      children: [],
    };
    contentChildren.push("company");
  }

  // Divider
  elements["divider"] = {
    type: "Path",
    props: { d: "M0 0 L200 0", stroke: style.accent, strokeWidth: 2, width: 200, height: 2 },
    children: [],
  };
  contentChildren.push("divider");

  // Contact info section
  const contactChildren = [];

  if (details.email) {
    elements["email"] = {
      type: "Text",
      props: {
        segments: [
          { text: "Email  ", style: { weight: "bold", color: style.labelColor || style.accent } },
          { text: details.email },
        ],
        size: 13,
        color: style.textSecondary,
        lineHeight: 1.6,
      },
      children: [],
    };
    contactChildren.push("email");
  }

  if (details.phone) {
    elements["phone"] = {
      type: "Text",
      props: {
        segments: [
          { text: "Phone  ", style: { weight: "bold", color: style.labelColor || style.accent } },
          { text: details.phone },
        ],
        size: 13,
        color: style.textSecondary,
        lineHeight: 1.6,
      },
      children: [],
    };
    contactChildren.push("phone");
  }

  if (details.website) {
    elements["website"] = {
      type: "Text",
      props: {
        segments: [
          { text: "Web  ", style: { weight: "bold", color: style.labelColor || style.accent } },
          { text: details.website },
        ],
        size: 13,
        color: style.textSecondary,
        lineHeight: 1.6,
      },
      children: [],
    };
    contactChildren.push("website");
  }

  if (details.address) {
    elements["address"] = {
      type: "Text",
      props: {
        segments: [
          { text: "Addr  ", style: { weight: "bold", color: style.labelColor || style.accent } },
          { text: details.address },
        ],
        size: 13,
        color: style.textSecondary,
        lineHeight: 1.6,
      },
      children: [],
    };
    contactChildren.push("address");
  }

  if (contactChildren.length > 0) {
    elements["contact"] = {
      type: "Column",
      props: { gap: 4 },
      children: contactChildren,
    };
    contentChildren.push("contact");
  }

  // Content column
  elements["content"] = {
    type: "Column",
    props: { gap: 10 },
    children: contentChildren,
  };

  // Card wrapper
  elements["card"] = {
    type: "Column",
    props: {
      width: 400,
      padding: 32,
      gap: 0,
      background: style.cardBg,
      borderWidth: 1,
      borderColor: style.accent + "33",
      cornerRadius: 12,
    },
    children: ["content"],
  };

  // Root
  elements["root"] = {
    type: "Column",
    props: {
      width: 480,
      padding: 40,
      background: style.bg,
      alignItems: "center",
    },
    children: ["card"],
  };

  return { root: "root", elements };
}

/**
 * Check if the message is asking for a card/design that we can handle locally.
 */
function isCardRequest(message) {
  const lower = message.toLowerCase();
  return (
    lower.match(/\b(card|business card|profile|contact card|design a card|id card|name card|khmer card|khmer)\b/) != null ||
    message.match(/[\u1780-\u17FF]/) != null // contains Khmer script
  );
}

export async function handleChat(body, { signal } = {}) {
  const message =
    body != null && typeof body === "object" && typeof body.message === "string"
      ? body.message.trim()
      : "";

  const conversationId =
    body != null && typeof body.conversation_id === "string" && body.conversation_id
      ? body.conversation_id
      : randomUUID();

  const previousSpec = conversations.get(conversationId) ?? null;

  // Try local card builder first for card-related requests
  if (message && isCardRequest(message)) {
    const details = extractCardDetails(message);
    const style = detectStyle(message);

    // Fill in defaults if the user didn't specify much
    if (!details.name) details.name = "Your Name";

    const spec = buildCardSpec(details, style);
    conversations.set(conversationId, spec);

    const fields = Object.keys(details).filter((k) => details[k]).join(", ");
    const response = `Designed a card with: ${fields || "default layout"}. Send another message to refine the style or add details like name, title, email, phone, company.`;

    return { conversation_id: conversationId, response, spec };
  }

  // Fall through to LLM generation or fixture
  const generateBody = {
    prompt: message || "Create a simple greeting card",
    previousSpec,
    fixture: !message,
  };

  try {
    const { stream } = await createGenerationStream(generateBody, { signal });
    const patches = await collectPatches(stream, signal);
    const spec = applyPatches(patches);

    conversations.set(conversationId, spec);

    const elementCount = spec.elements ? Object.keys(spec.elements).length : 0;
    const response = message
      ? `Generated a Sone layout with ${elementCount} element(s) from your prompt.`
      : `Here's a sample Sone layout with ${elementCount} element(s). Send a message to generate your own.`;

    return { conversation_id: conversationId, response, spec };
  } catch (error) {
    // If LLM is unavailable but we have a message, try building a generic card anyway
    if (error?.status === 503 && message) {
      const details = extractCardDetails(message);
      const style = detectStyle(message);
      if (!details.name) details.name = "Your Name";
      const spec = buildCardSpec(details, style);
      conversations.set(conversationId, spec);

      return {
        conversation_id: conversationId,
        response: `Created a card layout from your message (local mode). Add details like name, title, email to customize.`,
        spec,
      };
    }
    throw error;
  }
}
