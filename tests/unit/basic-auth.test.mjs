import assert from 'node:assert/strict';
import test from 'node:test';
import { basicAuthHeader, getBasicAuthConfig, isBasicAuthValid } from '../../src/lib/basic-auth.ts';

test('authentication is optional, but partial configuration fails closed', () => {
  assert.equal(getBasicAuthConfig({}), null);
  assert.equal(getBasicAuthConfig({ HARBORGUARD_AUTH_USERNAME: 'admin' }), 'invalid');
  assert.equal(getBasicAuthConfig({ HARBORGUARD_AUTH_PASSWORD: 'secret' }), 'invalid');
  assert.equal(getBasicAuthConfig({ HARBORGUARD_AUTH_USERNAME: 'a:b', HARBORGUARD_AUTH_PASSWORD: 'secret' }), 'invalid');
});

test('validates UTF-8 Basic credentials and rejects malformed or incorrect headers', () => {
  const config = getBasicAuthConfig({ HARBORGUARD_AUTH_USERNAME: 'rené', HARBORGUARD_AUTH_PASSWORD: 'päss:word' });
  assert.ok(config && config !== 'invalid');
  assert.equal(isBasicAuthValid(basicAuthHeader(config), config), true);
  assert.equal(isBasicAuthValid(null, config), false);
  assert.equal(isBasicAuthValid('Bearer token', config), false);
  assert.equal(isBasicAuthValid('Basic !!!!', config), false);
  assert.equal(isBasicAuthValid('Basic '+btoa('rené:wrong'), config), false);
  assert.equal(isBasicAuthValid('Basic '+btoa('other:päss:word'), config), false);
});
