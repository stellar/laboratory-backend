import { CursorData, encodeCursor } from "../../src/helpers/cursor";

describe("encodeCursor", () => {
  test("does not mutate the input object", () => {
    const input: CursorData = {
      cursorType: "next",
      position: {
        keyHash: "abc",
        sortValue: BigInt(123),
      },
    };

    const originalType = input.cursorType;
    const originalSortValue = input.position.sortValue;

    encodeCursor(input);

    expect(input.cursorType).toBe(originalType);
    expect(input.position.sortValue).toBe(originalSortValue);
  });
});
