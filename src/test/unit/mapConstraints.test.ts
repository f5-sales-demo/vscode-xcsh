import { GENERATED_RESOURCE_TYPES } from '../../generated/resourceTypesBase';
import { renderConstraintBadge } from '../../providers/metadataRenderer';
import { generateSchemaForResourceType } from '../../schema/schemaGenerator';

describe('structured map metadata', () => {
  it('projects value and cardinality bounds at their correct schema scopes', () => {
    const fields = GENERATED_RESOURCE_TYPES.http_loadbalancer.fieldMetadata!.fields;
    const previous = fields['spec.more_option.custom_errors'];
    fields['spec.more_option.custom_errors'] = {
      type: 'object',
      constraints: {
        constraintType: 'map',
        values: { type: 'string', maxLength: 65536 },
        cardinality: { maxProperties: 16 },
        keys: {
          ranges: [
            [3, 3],
            [300, 599],
          ],
        },
      },
    };
    try {
      const schema = generateSchemaForResourceType('http_loadbalancer');
      const map = schema!.properties.spec.properties!.more_option.properties!.custom_errors;
      expect(map.maxProperties).toBe(16);
      expect(map.maxLength).toBeUndefined();
      expect(map.additionalProperties).toMatchObject({ type: 'string', maxLength: 65536 });
      expect(renderConstraintBadge(fields['spec.more_option.custom_errors'].constraints)).toContain('65536');
    } finally {
      if (previous) {
        fields['spec.more_option.custom_errors'] = previous;
      } else {
        delete fields['spec.more_option.custom_errors'];
      }
    }
  });
});
