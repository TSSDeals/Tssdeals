import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedDealEmailSenders,
  dealEmailMediaId,
  normalizeDealEmail,
  selectDealEmailImage,
  validDealInboxToken,
} from "./email-deal-inbox";

test("normalizes SendGrid mailbox syntax and restricts senders", () => {
  assert.equal(normalizeDealEmail("Justin Shirk <Justin@TwinSeamSports.com>"), "justin@twinseamsports.com");
  const approved = approvedDealEmailSenders();
  assert.equal(approved.has("justin@twinseamsports.com"), true);
  assert.equal(approved.has("tssadmin@twinseamsports.com"), true);
  assert.equal(approved.has("stranger@example.com"), false);
});

test("requires a configured constant-time webhook token", () => {
  assert.equal(validDealInboxToken("secret", "secret"), true);
  assert.equal(validDealInboxToken("wrong", "secret"), false);
  assert.equal(validDealInboxToken("", ""), false);
});

test("selects only the first supported image attachment", () => {
  const files = [
    { mimetype: "application/pdf" },
    { mimetype: "image/jpeg" },
    { mimetype: "image/png" },
  ] as Express.Multer.File[];
  assert.equal(selectDealEmailImage(files), files[1]);
  assert.equal(selectDealEmailImage([{ mimetype: "text/plain" }] as Express.Multer.File[]), null);
});

test("media identity is deterministic and does not expose file contents", () => {
  const id = dealEmailMediaId(Buffer.from("private image bytes"));
  assert.match(id, /^[a-f0-9]{40}$/);
  assert.equal(id, dealEmailMediaId(Buffer.from("private image bytes")));
});
