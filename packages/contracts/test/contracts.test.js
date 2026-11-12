const assert = require('assert');
const {
  USER_ROLES,
  UserRoleEnum,
  isValidUserRole,
  assertValidUserRole,
  mapLegacyRoleToActive
} = require('../dist/index.js');

console.log('=== CONTRACTS USER ROLE TESTS ===');

// 1. Roles inventory: exactly ADMIN and CONTRIBUTOR
assert.deepStrictEqual(
  Array.from(USER_ROLES),
  ['ADMIN', 'CONTRIBUTOR'],
  'USER_ROLES must contain exactly ADMIN and CONTRIBUTOR'
);

assert.strictEqual(
  USER_ROLES.includes('VIEWER'),
  false,
  'USER_ROLES must not contain VIEWER'
);

assert.strictEqual(UserRoleEnum.ADMIN, 'ADMIN');
assert.strictEqual(UserRoleEnum.CONTRIBUTOR, 'CONTRIBUTOR');
assert.strictEqual(UserRoleEnum.VIEWER, undefined, 'UserRoleEnum must not have VIEWER member');

// 2. Validation functions
assert.strictEqual(isValidUserRole('ADMIN'), true);
assert.strictEqual(isValidUserRole('CONTRIBUTOR'), true);
assert.strictEqual(isValidUserRole('VIEWER'), false, 'isValidUserRole must reject VIEWER');
assert.strictEqual(isValidUserRole('SUPERUSER'), false);
assert.strictEqual(isValidUserRole(''), false);
assert.strictEqual(isValidUserRole(null), false);
assert.strictEqual(isValidUserRole(undefined), false);

// 3. Assertion helper
assert.doesNotThrow(() => assertValidUserRole('ADMIN'));
assert.doesNotThrow(() => assertValidUserRole('CONTRIBUTOR'));
assert.throws(
  () => assertValidUserRole('VIEWER'),
  /Invalid UserRole: "VIEWER"/,
  'assertValidUserRole must throw on VIEWER'
);
assert.throws(
  () => assertValidUserRole('UNKNOWN'),
  /Invalid UserRole: "UNKNOWN"/,
  'assertValidUserRole must throw on UNKNOWN'
);

// 4. Legacy compatibility mapping
assert.strictEqual(mapLegacyRoleToActive('ADMIN'), 'ADMIN');
assert.strictEqual(mapLegacyRoleToActive('CONTRIBUTOR'), 'CONTRIBUTOR');
assert.strictEqual(mapLegacyRoleToActive('VIEWER'), 'CONTRIBUTOR', 'mapLegacyRoleToActive must map legacy VIEWER to CONTRIBUTOR');
assert.throws(() => mapLegacyRoleToActive('INVALID'), /Unknown or invalid role/);

console.log('ALL CONTRACTS TESTS PASSED!');
