// Custom Jest matchers for pagination link testing

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveValidPaginationLinks(expectedParams: {
        contractId: string;
        network: string;
        sortBy?: string;
        order?: string;
        limit?: string;
        cursor?: string;
        containsNext?: boolean;
        containsPrev?: boolean;
      }): R;
      toHaveValidCursor(cursorType: "next" | "prev"): R;
    }
  }
}

export function setupCustomMatchers() {
  expect.extend({
    toHaveValidPaginationLinks(response: any, expectedParams: any) {
      const { _links } = response;

      if (!_links) {
        return {
          message: () => "Expected response to have _links property",
          pass: false,
        };
      }

      const {
        contractId,
        network,
        sortBy,
        order,
        limit,
        cursor,
        containsNext = false,
        containsPrev = false,
      } = expectedParams;
      const basePath = `/api/${network}/contract/${contractId}/storage`;

      /**
       * Validates a link object against expected parameters.
       * @param link - The link object to validate.
       * @param linkType - The type of link (self, next, prev).
       * @param expectedPath - The expected path of the link.
       * @returns A validation result object.
       */
      const validateLink = (
        link: { href: string } | undefined,
        linkType: "self" | "next" | "prev",
        expectedPath: string
      ) => {
        if (!link?.href) {
          return {
            message: () => `Expected _links.${linkType}.href to be defined`,
            pass: false,
          };
        }

        const url = new URL(link.href, "http://example.test");

        if (url.pathname !== expectedPath) {
          return {
            message: () => `Expected _links.${linkType}.href's path to be ${expectedPath}, got ${url.pathname}`,
            pass: false,
          };
        }

        // Validate query parameters
        const gotOrder = url.searchParams.get("order");
        if (order && gotOrder !== order) {
          return {
            message: () => `Expected _links.${linkType}.href's order=${order}, got ${gotOrder}`,
            pass: false,
          };
        }

        const gotLimit = url.searchParams.get("limit");
        if (limit && gotLimit !== limit) {
          return {
            message: () => `Expected _links.${linkType}.href's limit=${limit}, got ${gotLimit}`,
            pass: false,
          };
        }

        const gotSortBy = url.searchParams.get("sort_by");
        if (sortBy && gotSortBy !== sortBy) {
          return {
            message: () => `Expected _links.${linkType}.href's sort_by=${sortBy}, got ${gotSortBy}`,
            pass: false,
          };
        }

        const gotCursor = url.searchParams.get("cursor");
        if (cursor && gotCursor !== cursor) {
          return {
            message: () => `Expected _links.${linkType}.href's cursor=${cursor}, got ${gotCursor}`,
            pass: false,
          };
        }

        // For next/prev links, ensure they have cursor parameter
        if ((linkType === "next" || linkType === "prev") && !url.searchParams.get("cursor")) {
          return {
            message: () => `Expected _links.${linkType}.href to have cursor parameter`,
            pass: false,
          };
        }
        return {
          message: () => `_links.${linkType}.href is valid`,
          pass: true,
        };
      };

      // Validate self link
      const selfValidation = validateLink(_links.self, "self", basePath);
      if (!selfValidation.pass) {
        return selfValidation;
      }

      // Validate next link if expected
      if (containsNext) {
        const nextValidation = validateLink(_links.next, "next", basePath);
        if (!nextValidation.pass) {
          return nextValidation;
        }
      }

      // Validate prev link if expected
      if (containsPrev) {
        const prevValidation = validateLink(_links.prev, "prev", basePath);
        if (!prevValidation.pass) {
          return prevValidation;
        }
      }

      return {
        message: () => "Pagination links are valid",
        pass: true,
      };
    },

    toHaveValidCursor(response: any, cursorType: "next" | "prev") {
      const { _links } = response;
      const link = _links[cursorType];

      if (!link?.href) {
        return {
          message: () => `Expected _links.${cursorType}.href to be defined`,
          pass: false,
        };
      }

      const url = new URL(link.href, "http://example.test");
      const cursor = url.searchParams.get("cursor");

      if (!cursor) {
        return {
          message: () => `Expected ${cursorType} link to have cursor parameter`,
          pass: false,
        };
      }

      // Basic cursor validation (should be base64 encoded)
      try {
        const decoded = Buffer.from(cursor, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded);

        if (!parsed.position || !parsed.position.pkId) {
          return {
            message: () => `Expected cursor to have position.pkId, got ${JSON.stringify(parsed)}`,
            pass: false,
          };
        }
      } catch (error) {
        return {
          message: () => `Expected cursor to be valid base64 JSON, got error: ${error}`,
          pass: false,
        };
      }

      return {
        message: () => `${cursorType} cursor is valid`,
        pass: true,
      };
    },
  });
}
