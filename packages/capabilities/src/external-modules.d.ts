declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string });
    window: { document: any };
  }
}

declare module "turndown" {
  export default class TurndownService {
    constructor(options?: unknown);
    turndown(input: string): string;
  }
}
