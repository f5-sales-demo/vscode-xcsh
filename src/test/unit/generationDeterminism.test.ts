// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Unit tests for generation pipeline determinism.
 *
 * Validates that the spec parsing and code generation pipeline
 * produces identical output across multiple invocations, ensuring
 * no timestamps, random values, or non-deterministic ordering.
 */

import * as crypto from 'crypto';
import * as path from 'path';
import { parseAllDomainFiles, ParsedSpecInfo } from '../../../scripts/generators/spec-parser';
import { generateResourceTypesContent } from '../../../scripts/generators/resource-type-generator';

const DOMAINS_DIR = path.resolve(__dirname, '../../../docs/specifications/api/domains');

describe('Generation Determinism', () => {
  describe('parseAllDomainFiles determinism', () => {
    let firstResult: ParsedSpecInfo[];
    let secondResult: ParsedSpecInfo[];

    beforeAll(() => {
      firstResult = parseAllDomainFiles(DOMAINS_DIR);
      secondResult = parseAllDomainFiles(DOMAINS_DIR);
    });

    it('should return the same number of resources on two calls', () => {
      expect(firstResult.length).toBe(secondResult.length);
    });

    it('should return the same resourceKeys in the same order', () => {
      const firstKeys = firstResult.map((r) => r.resourceKey);
      const secondKeys = secondResult.map((r) => r.resourceKey);

      expect(firstKeys).toEqual(secondKeys);
    });

    it('should return identical data on two calls', () => {
      // Stringify both results and compare
      const firstJson = JSON.stringify(firstResult);
      const secondJson = JSON.stringify(secondResult);

      expect(firstJson).toBe(secondJson);
    });
  });

  describe('generateResourceTypesContent determinism', () => {
    let parsedSpecs: ParsedSpecInfo[];
    let firstContent: string;
    let secondContent: string;

    beforeAll(() => {
      parsedSpecs = parseAllDomainFiles(DOMAINS_DIR);
      firstContent = generateResourceTypesContent(parsedSpecs);
      secondContent = generateResourceTypesContent(parsedSpecs);
    });

    it('should produce identical SHA256 on two calls', () => {
      const firstHash = crypto.createHash('sha256').update(firstContent).digest('hex');
      const secondHash = crypto.createHash('sha256').update(secondContent).digest('hex');

      expect(firstHash).toBe(secondHash);
    });

    it('should produce identical content on two calls', () => {
      expect(firstContent).toBe(secondContent);
    });

    it('should not contain timestamps in generated content', () => {
      // Check for common timestamp patterns
      // ISO 8601 dates like 2026-05-18T...
      expect(firstContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);

      // Epoch timestamps (13+ digits for milliseconds)
      expect(firstContent).not.toMatch(/\b1\d{12}\b/);

      // Date.now() or new Date() patterns
      expect(firstContent).not.toMatch(/Date\.now\(\)/);
      expect(firstContent).not.toMatch(/new Date\(\)/);

      // "Generated at" or "Generated on" type comments
      expect(firstContent).not.toMatch(/generated (?:at|on)\s+\d/i);
    });

    it('generated content should be non-empty and contain expected markers', () => {
      expect(firstContent.length).toBeGreaterThan(0);
      expect(firstContent).toContain('GENERATED_RESOURCE_TYPES');
      expect(firstContent).toContain('API_PATH_TO_RESOURCE_KEY');
      expect(firstContent).toContain('Total resource types:');
    });
  });
});
