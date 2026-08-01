import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  signGithubPayload,
  verifyGithubSignature,
} from "../src/lib/githubSignature";

const SECRET = "It's a Secret to Everybody";
const BODY = '{"action":"closed","pull_request":{"number":42,"merged":true}}';

describe("verifyGithubSignature", () => {
  test("accepts a signature computed with the correct secret", () => {
    const sig = signGithubPayload(BODY, SECRET);
    expect(verifyGithubSignature(BODY, sig, SECRET)).toBe(true);
  });

  test("accepts a signature independently computed with createHmac", () => {
    // Cross-check: use Node's crypto directly to sign the same way GitHub does.
    const sig =
      "sha256=" +
      createHmac("sha256", SECRET).update(BODY, "utf8").digest("hex");
    expect(verifyGithubSignature(BODY, sig, SECRET)).toBe(true);
  });

  test("rejects a signature computed with the wrong secret", () => {
    const sig = signGithubPayload(BODY, "different-secret");
    expect(verifyGithubSignature(BODY, sig, SECRET)).toBe(false);
  });

  test("rejects when the body has been tampered with", () => {
    const sig = signGithubPayload(BODY, SECRET);
    const tampered = BODY.replace("merged\":true", "merged\":false");
    expect(verifyGithubSignature(tampered, sig, SECRET)).toBe(false);
  });

  test("rejects when the signature header is missing", () => {
    expect(verifyGithubSignature(BODY, null, SECRET)).toBe(false);
  });

  test("rejects an empty signature header", () => {
    expect(verifyGithubSignature(BODY, "", SECRET)).toBe(false);
  });

  test("rejects a signature without the sha256= prefix", () => {
    const sig = signGithubPayload(BODY, SECRET).slice("sha256=".length);
    expect(verifyGithubSignature(BODY, sig, SECRET)).toBe(false);
  });

  test("rejects a malformed signature (non-hex characters)", () => {
    expect(
      verifyGithubSignature(
        BODY,
        "sha256=" + "z".repeat(64),
        SECRET,
      ),
    ).toBe(false);
  });

  test("rejects a signature with a different length than the digest", () => {
    // Buffer timingSafeEqual requires equal lengths; our explicit length
    // pre-check must reject this before reaching that.
    const tooShort = "sha256=abc123";
    expect(verifyGithubSignature(BODY, tooShort, SECRET)).toBe(false);
  });

  test("rejects a signature with extra characters beyond hex length", () => {
    const valid = signGithubPayload(BODY, SECRET);
    const padded = valid + "00";
    expect(verifyGithubSignature(BODY, padded, SECRET)).toBe(false);
  });

  test("handles unicode bodies correctly (utf8 encoding)", () => {
    const unicodeBody = JSON.stringify({
      title: "Why 现金流 matters",
      body: "Some unicode 🎉",
    });
    const sig = signGithubPayload(unicodeBody, SECRET);
    expect(verifyGithubSignature(unicodeBody, sig, SECRET)).toBe(true);
  });

  test("rejects an empty body with non-empty signature (and vice versa)", () => {
    const sig = signGithubPayload(BODY, SECRET);
    expect(verifyGithubSignature("", sig, SECRET)).toBe(false);
    const sigForEmpty = signGithubPayload("", SECRET);
    expect(verifyGithubSignature(BODY, sigForEmpty, SECRET)).toBe(false);
  });

  test("accepts signatures against larger GitHub-style payloads", () => {
    const big = JSON.stringify({
      action: "closed",
      number: 1,
      pull_request: {
        number: 1,
        html_url: "https://github.com/foo/bar/pull/1",
        merged: true,
        head: { ref: "content/some-slug-kg71zb4c" },
        title: "[Content Studio] Some slug",
      },
      repository: { full_name: "foo/bar" },
      sender: { login: "octocat" },
    });
    const sig = signGithubPayload(big, SECRET);
    expect(verifyGithubSignature(big, sig, SECRET)).toBe(true);
  });
});
