import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CreateFieldNoteInputSchema,
  FieldNoteSchema,
  FieldNoteSearchInputSchema,
  UpdateFieldNoteInputSchema,
} from "./fieldNote.js";

describe("CreateFieldNoteInputSchema", () => {
  it("accepts a minimal note", () => {
    const result = CreateFieldNoteInputSchema.safeParse({ title: "Flip chip", body: "Some prose." });
    expect(result.success).toBe(true);
  });

  it("accepts a fully specified note with a valid Handbook slug", () => {
    const result = CreateFieldNoteInputSchema.safeParse({
      title: "Flip chip to short — B-tension needs resetting",
      body: "Flipped the rear axle chip from long to short...",
      symptom: "Chain collided with the derailleur in the highest gear",
      cause: "Same chain length on a shorter chainstay changed derailleur position",
      resolution: "Backed off the B-tension screw for a few mm of clearance",
      brand: "Rocky Mountain",
      model: "Altitude",
      modelYearFrom: 2021,
      modelYearTo: 2023,
      tags: ["flip-chip", "drivetrain", "b-tension"],
      handbookSlugs: ["chainstay", "wheelbase"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown Handbook slug", () => {
    const result = CreateFieldNoteInputSchema.safeParse({
      title: "Flip chip",
      body: "Some prose.",
      handbookSlugs: ["not-a-real-slug"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects modelYearFrom after modelYearTo", () => {
    const result = CreateFieldNoteInputSchema.safeParse({
      title: "Flip chip",
      body: "Some prose.",
      modelYearFrom: 2023,
      modelYearTo: 2021,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing title or body", () => {
    expect(CreateFieldNoteInputSchema.safeParse({ body: "Some prose." }).success).toBe(false);
    expect(CreateFieldNoteInputSchema.safeParse({ title: "Flip chip" }).success).toBe(false);
  });
});

describe("UpdateFieldNoteInputSchema", () => {
  it("accepts a partial patch", () => {
    expect(UpdateFieldNoteInputSchema.safeParse({ tags: ["flip-chip"] }).success).toBe(true);
  });

  it("still rejects an unknown Handbook slug on partial update", () => {
    expect(UpdateFieldNoteInputSchema.safeParse({ handbookSlugs: ["nope"] }).success).toBe(false);
  });
});

describe("FieldNoteSearchInputSchema", () => {
  it("defaults limit to 10", () => {
    const parsed = FieldNoteSearchInputSchema.parse({});
    expect(parsed.limit).toBe(10);
  });

  it("rejects a limit above 50", () => {
    expect(FieldNoteSearchInputSchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});

describe("FieldNoteSchema", () => {
  it("parses a full row shape", () => {
    const now = new Date().toISOString();
    const result = FieldNoteSchema.safeParse({
      id: randomUUID(),
      ownerId: randomUUID(),
      title: "Flip chip",
      body: "Some prose.",
      symptom: null,
      cause: null,
      resolution: null,
      brand: null,
      model: null,
      modelYearFrom: null,
      modelYearTo: null,
      status: "published",
      source: "user",
      sourceSessionId: null,
      productIds: [],
      tags: [],
      handbookSlugs: [],
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });
});
