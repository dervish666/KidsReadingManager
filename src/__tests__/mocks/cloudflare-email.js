/**
 * Mock for cloudflare:email module
 * Used in tests to avoid Cloudflare-specific imports
 */

export class EmailMessage {
  constructor(from, to, raw) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}
